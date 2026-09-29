import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, PaginatedResponse } from '~/types'
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
    
    // ユーザー本人の取引をUserTimestampIndexで取得する（取引テーブル全件scanを避ける）
    const fetchUserTransactions = async (): Promise<Transaction[]> => {
      const result = await dynamodb.query(
        transactionsTableName,
        'user_id = :user_id',
        transactionType !== 'all'
          ? { ':user_id': currentUser.user_id, ':transaction_type': transactionType }
          : { ':user_id': currentUser.user_id },
        {
          indexName: 'UserTimestampIndex',
          filterExpression: transactionType !== 'all' ? 'transaction_type = :transaction_type' : undefined
        }
      )

      // 時系列でソート（降順：新しいものから）
      return (result.items as Transaction[]).sort((a, b) => {
        const dateA = new Date(a.requested_at || a.timestamp)
        const dateB = new Date(b.requested_at || b.timestamp)
        return dateB.getTime() - dateA.getTime()
      })
    }

    let transactions: Transaction[] = []
    
    if (status === 'all') {
      transactions = await fetchUserTransactions()
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
        
        // インデックスに問題がある場合のフォールバック：本人の取引を取得してステータスで絞り込む
        // statusが未設定の場合は'approved'として扱う
        transactions = (await fetchUserTransactions()).filter(t => {
          const transactionStatus = t.status || 'approved'
          return transactionStatus === status
        })
      }
    }
    
    // ページネーション処理
    const offset = (page - 1) * limit
    const paginatedTransactions = transactions.slice(offset, offset + limit)
    const total = transactions.length
    
    logger.info(`ユーザーリクエスト取得完了: ${paginatedTransactions.length}件 (total: ${total})`)
    
    const response: PaginatedResponse<Transaction> = {
      items: paginatedTransactions,
      total,
      page,
      limit,
      hasMore: offset + limit < total
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