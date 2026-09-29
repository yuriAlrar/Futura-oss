import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, User, PaginatedResponse } from '~/types'

type EnrichedTransaction = Transaction & {
  user_name: string
  user_email: string
}

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminTransactionsGet]' })
  try {
    logger.debug('管理者取引履歴API呼び出し開始')
    
    // Require admin permission to read all transactions
    const currentUser = await requirePermission(event, 'admin:transaction:read')
    logger.debug('管理者認証成功:', { userId: currentUser.user_id, permissions: currentUser.permissions })
    
    const query = getQuery(event)
    const page = Number(query.page) || 1
    const limit = Math.min(Number(query.limit) || 20, 100)
    const transactionType = query.transaction_type as string
    const status = query.status as string
    const userId = query.user_id as string

    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const usersTableName = dynamodb.getTableName('users')
    logger.debug('使用するテーブル名:', { transactionsTableName, usersTableName })
    
    let transactions: Transaction[] = []
    
    // Get all transactions (admin privilege)
    if (userId) {
      // Filter by specific user if requested
      logger.debug('特定ユーザーの取引履歴を取得中:', { userId, indexName: 'UserTimestampIndex' })
      const result = await dynamodb.query(
        transactionsTableName,
        'user_id = :user_id',
        { ':user_id': userId },
        {
          indexName: 'UserTimestampIndex',
          scanIndexForward: false // Sort by timestamp descending
        }
      )
      transactions = result.items as Transaction[]
    } else {
      // Get all transactions across all users
      logger.debug('全ユーザーの取引履歴を取得中')
      const result = await dynamodb.scan(transactionsTableName)
      transactions = result.items as Transaction[]
      
      // Sort by timestamp descending manually since scan doesn't support sorting
      transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    }
    
    logger.debug('取引履歴取得結果:', { count: transactions.length })

    // Filter by transaction type if specified
    if (transactionType && transactionType !== 'all') {
      transactions = transactions.filter(t => t.transaction_type === transactionType)
      logger.debug('取引種別フィルタ適用後:', { transactionType, count: transactions.length })
    }

    // Filter by status if specified
    if (status && status !== 'all') {
      transactions = transactions.filter(t => {
        const s = t.status || 'approved'
        return s === status
      })
      logger.debug('ステータスフィルタ適用後:', { status, count: transactions.length })
    }

    // Simple pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const pageTransactions = transactions.slice(startIndex, endIndex)

    // 表示対象ページのユーザー情報のみ取得する（usersテーブル全件scanを避ける）
    logger.debug('ユーザー情報を取得中')
    const pageUserIds = [...new Set(pageTransactions.map(t => t.user_id))]
    const pageUsers = await Promise.all(
      pageUserIds.map(id => dynamodb.get(usersTableName, { user_id: id }) as Promise<User | undefined>)
    )
    const userMap = new Map(pageUsers.filter((u): u is User => !!u).map(user => [user.user_id, user]))
    
    // Enrich transactions with user data
    const paginatedTransactions: EnrichedTransaction[] = pageTransactions.map(transaction => {
      const user = userMap.get(transaction.user_id)
      return {
        ...transaction,
        user_name: user?.name || 'Unknown User',
        user_email: user?.email || 'Unknown Email'
      }
    })

    const response: PaginatedResponse<EnrichedTransaction> = {
      items: paginatedTransactions,
      total: transactions.length,
      page,
      limit,
      hasMore: endIndex < transactions.length
    }

    logger.debug('最終レスポンス:', { 
      totalItems: transactions.length,
      paginatedItems: paginatedTransactions.length,
      page,
      limit
    })

    return {
      success: true,
      data: response
    }
  } catch (error: unknown) {
    logger.error('管理者取引取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch all transactions'
    })
  }
})