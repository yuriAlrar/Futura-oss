import { getDynamoDBService } from '~/server/utils/dynamodb'
import { isApprovedTransaction } from '~/server/utils/transaction-helpers'
import { sumTransactionsBtc, toStatsDateString, todayStatsDateString } from '~/server/utils/stats-helpers'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, User, PaginatedResponse, AdminTransactionStats } from '~/types'
import { TRANSACTION_STATUS } from '~/types'

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

    // 統計値は絞り込み後の全件が対象（現在ページではない）
    const today = todayStatsDateString()
    const todayTransactions = transactions.filter(t => toStatsDateString(t.timestamp) === today)
    const todayApprovedTransactions = todayTransactions.filter(isApprovedTransaction)

    const stats: AdminTransactionStats = {
      totalCount: transactions.length,
      pendingCount: transactions.filter(t => t.status === TRANSACTION_STATUS.PENDING).length,
      todayCount: todayTransactions.length,
      todayDeposits: sumTransactionsBtc(todayTransactions, 'deposit'),
      todayWithdrawals: sumTransactionsBtc(todayTransactions, 'withdrawal'),
      todayApprovedCount: todayApprovedTransactions.length,
      todayApprovedDeposits: sumTransactionsBtc(todayApprovedTransactions, 'deposit'),
      todayApprovedWithdrawals: sumTransactionsBtc(todayApprovedTransactions, 'withdrawal')
    }

    // Get all users to enrich transaction data
    logger.debug('ユーザー情報を取得中')
    const usersResult = await dynamodb.scan(usersTableName)
    const users = usersResult.items as User[]
    const userMap = new Map(users.map(user => [user.user_id, user]))
    
    // Enrich transactions with user data
    const enrichedTransactions: EnrichedTransaction[] = transactions.map(transaction => {
      const user = userMap.get(transaction.user_id)
      return {
        ...transaction,
        user_name: user?.name || 'Unknown User',
        user_email: user?.email || 'Unknown Email'
      }
    })

    // Simple pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedTransactions = enrichedTransactions.slice(startIndex, endIndex)

    const response: PaginatedResponse<EnrichedTransaction, AdminTransactionStats> = {
      items: paginatedTransactions,
      total: enrichedTransactions.length,
      page,
      limit,
      hasMore: endIndex < enrichedTransactions.length,
      stats
    }

    logger.debug('最終レスポンス:', { 
      totalItems: enrichedTransactions.length,
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