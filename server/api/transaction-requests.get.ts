import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, PaginatedResponse, TransactionRequestStats } from '~/types'
import { TRANSACTION_STATUS } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[UserTransactionRequests]' })
  
  try {
    // 認証チェック
    const currentUser = await requirePermission(event, 'transaction:read')
    
    const query = getQuery(event)
    const status = query.status as string || 'all'
    const transactionType = query.transaction_type as string || 'all'
    const page = Math.max(1, parseInt((query.page as string) || '1'))
    const limit = Math.min(50, Math.max(1, parseInt((query.limit as string) || '20')))
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    
    logger.info(`ユーザーリクエスト検索開始: userId=${currentUser.user_id}, status=${status}, transactionType=${transactionType}, page=${page}, limit=${limit}`)
    
    // transaction_typeの有効性チェック
    const validTransactionTypes = ['deposit', 'withdrawal', 'all']
    if (!validTransactionTypes.includes(transactionType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid transaction_type. Must be one of: ${validTransactionTypes.join(', ')}`
      })
    }
    
    // 統計カードはステータス絞り込み前の全件が対象。
    // 表示用の取得結果から数えると現在ページ・現在の絞り込み分しか数えられないため、
    // UserTimestampIndexで当該ユーザーの全取引を取得して別途集計する。
    const statsResult = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': currentUser.user_id },
      {
        indexName: 'UserTimestampIndex'
      }
    )

    // 資産運用は入出金リクエストではないため集計から除外する（画面の一覧と基準を揃える）
    const allRequests = (statsResult.items as Transaction[])
      .filter(t => t.transaction_type !== 'asset_management')

    // statusが未設定の既存データは承認済みとして扱う
    const statusOf = (transaction: Transaction) => transaction.status || TRANSACTION_STATUS.APPROVED

    const stats: TransactionRequestStats = {
      totalCount: allRequests.length,
      pendingCount: allRequests.filter(t => statusOf(t) === TRANSACTION_STATUS.PENDING).length,
      approvedCount: allRequests.filter(t => statusOf(t) === TRANSACTION_STATUS.APPROVED).length,
      rejectedCount: allRequests.filter(t => statusOf(t) === TRANSACTION_STATUS.REJECTED).length
    }

    let transactions: Transaction[] = []
    
    if (status === 'all') {
      // すべてのステータスを取得する場合、メインテーブルの全スキャンを使用
      // 効率は劣るが、ユーザー個人のデータなので実用上問題なし
      let filterExpression = 'user_id = :user_id'
      const expressionAttributeValues: any = { 
        ':user_id': currentUser.user_id
      }
      
      // transaction_typeフィルタリング
      if (transactionType !== 'all') {
        filterExpression += ' AND transaction_type = :transaction_type'
        expressionAttributeValues[':transaction_type'] = transactionType
      }
      
      const result = await dynamodb.scan(
        transactionsTableName,
        {
          filterExpression,
          expressionAttributeValues
        }
      )
      
      // 時系列でソート（降順：新しいものから）
      transactions = (result.items as Transaction[]).sort((a, b) => {
        const dateA = new Date(a.requested_at || a.timestamp)
        const dateB = new Date(b.requested_at || b.timestamp)
        return dateB.getTime() - dateA.getTime()
      })
    } else {
      // 特定のステータスのみ取得
      // ステータスの有効性チェック
      const validStatuses = [...Object.values(TRANSACTION_STATUS), 'approved'] // approvedも許可（レガシー対応）
      if (!validStatuses.includes(status as any)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid status. Must be one of: ${validStatuses.join(', ')}, all`
        })
      }
      
      // TransactionUserStatusIndexを使用してuser_id + statusでクエリ
      try {
        const result = await dynamodb.query(
          transactionsTableName,
          'user_id = :user_id AND #status = :status',
          { 
            ':user_id': currentUser.user_id,
            ':status': status
          },
          {
            indexName: 'TransactionUserStatusIndex',
            expressionAttributeNames: { '#status': 'status' },
            scanIndexForward: false // 時系列降順
          }
        )
        
        // transaction_typeでフィルタリング
        transactions = transactionType === 'all' 
          ? result.items as Transaction[]
          : (result.items as Transaction[]).filter(t => t.transaction_type === transactionType)
      } catch (indexError) {
        logger.warn(`TransactionUserStatusIndexでエラー: ${indexError}、フォールバックを実行`)
        
        // インデックスに問題がある場合のフォールバック：スキャンでフィルタリング
        let fallbackFilterExpression = 'user_id = :user_id'
        const fallbackExpressionAttributeValues: any = { 
          ':user_id': currentUser.user_id
        }
        
        // transaction_typeフィルタリング
        if (transactionType !== 'all') {
          fallbackFilterExpression += ' AND transaction_type = :transaction_type'
          fallbackExpressionAttributeValues[':transaction_type'] = transactionType
        }
        
        const allResult = await dynamodb.scan(
          transactionsTableName,
          {
            filterExpression: fallbackFilterExpression,
            expressionAttributeValues: fallbackExpressionAttributeValues
          }
        )
        
        // フィルタリング：statusが未設定の場合は'approved'として扱う
        transactions = (allResult.items as Transaction[]).filter(t => {
          const transactionStatus = t.status || 'approved'
          return transactionStatus === status
        }).sort((a, b) => {
          const dateA = new Date(a.requested_at || a.timestamp)
          const dateB = new Date(b.requested_at || b.timestamp)
          return dateB.getTime() - dateA.getTime()
        })
      }
    }
    
    // ページネーション処理
    const offset = (page - 1) * limit
    const paginatedTransactions = transactions.slice(offset, offset + limit)
    const total = transactions.length
    
    logger.info(`ユーザーリクエスト取得完了: ${paginatedTransactions.length}件 (total: ${total})`)
    
    const response: PaginatedResponse<Transaction, TransactionRequestStats> = {
      items: paginatedTransactions,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      stats
    }
    
    return {
      success: true,
      data: response
    }
    
  } catch (error: unknown) {
    logger.error('ユーザーリクエスト一覧取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch transaction requests'
    })
  }
})