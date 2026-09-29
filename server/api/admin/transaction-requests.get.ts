import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { EnhancedTransaction, User, PaginatedResponse } from '~/types'
import { TRANSACTION_STATUS } from '~/types'

interface EnhancedTransactionRequest extends EnhancedTransaction {
  user_name: string
  user_email: string
}

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminTransactionRequests]' })
  
  try {
    // 権限チェック: transaction:approve
    await requirePermission(event, 'transaction:approve')
    
    const query = getQuery(event)
    const status = (query.status as string) || TRANSACTION_STATUS.PENDING
    const page = Math.max(1, parseInt((query.page as string) || '1'))
    const limit = Math.min(50, Math.max(1, parseInt((query.limit as string) || '20')))
    
    // ステータスの有効性チェック
    const validStatuses = Object.values(TRANSACTION_STATUS)
    if (!validStatuses.includes(status as any)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid status. Must be ${validStatuses.join(', ')}`
      })
    }
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const usersTableName = dynamodb.getTableName('users')
    
    // StatusIndexを使用してリクエストを取得
    const offset = (page - 1) * limit
    
    logger.info(`リクエスト検索開始: status=${status}, page=${page}, limit=${limit}`)
    
    const transactionsResult = await dynamodb.query(
      transactionsTableName,
      '#status = :status',
      { ':status': status },
      {
        indexName: 'StatusIndex',
        expressionAttributeNames: { '#status': 'status' },
        scanIndexForward: false // requested_atの降順（totalを正しく返すため全件取得する）
      }
    )
    
    const allTransactions = transactionsResult.items as EnhancedTransaction[]
    
    // ページネーション処理
    const paginatedTransactions = allTransactions.slice(offset, offset + limit)
    const total = allTransactions.length
    
    // ユーザー情報を並行取得
    const userPromises = paginatedTransactions.map(async (transaction) => {
      try {
        const user = await dynamodb.get(usersTableName, { user_id: transaction.user_id }) as User
        return {
          ...transaction,
          user_name: user?.name || 'Unknown User',
          user_email: user?.email || 'Unknown Email'
        } as EnhancedTransactionRequest
      } catch (error) {
        logger.warn(`ユーザー情報取得に失敗: ${transaction.user_id}`, error)
        return {
          ...transaction,
          user_name: 'Unknown User',
          user_email: 'Unknown Email'
        } as EnhancedTransactionRequest
      }
    })
    
    const enhancedTransactions = await Promise.all(userPromises)
    
    logger.info(`リクエスト取得完了: ${enhancedTransactions.length}件 (total: ${total})`)
    
    const response: PaginatedResponse<EnhancedTransactionRequest> = {
      items: enhancedTransactions,
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
    logger.error('リクエスト一覧取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch transaction requests'
    })
  }
})