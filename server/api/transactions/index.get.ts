import { getDynamoDBService } from '~/server/utils/dynamodb'
import { isApprovedTransaction } from '~/server/utils/transaction-helpers'
import { buildRunningBalanceMap, sumTransactionsBtc } from '~/server/utils/stats-helpers'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, User, PaginatedResponse, TransactionStats } from '~/types'
import { TRANSACTION_STATUS } from '~/types'

type EnrichedTransaction = Transaction & {
  user_name: string
  user_email: string
  running_balance: number
}

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[TransactionsGet]' })
  try {
    logger.debug('取引履歴API呼び出し開始')
    // Require permission to read transactions
    const currentUser = await requirePermission(event, 'transaction:read')
    logger.debug('ユーザー認証成功:', { userId: currentUser.user_id, permissions: currentUser.permissions })
    
    const query = getQuery(event)
    const page = Number(query.page) || 1
    const limit = Math.min(Number(query.limit) || 20, 100)
    const transactionType = query.transaction_type as string

    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    logger.debug('使用するテーブル名:', transactionsTableName)
    
    // Always get transactions for the authenticated user only
    logger.debug('認証ユーザーの取引履歴を取得中:', { userId: currentUser.user_id, indexName: 'UserTimestampIndex' })
    const result = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': currentUser.user_id },
      {
        indexName: 'UserTimestampIndex',
        scanIndexForward: false // Sort by timestamp descending
      }
    )
    const allTransactions = result.items as Transaction[]
    logger.debug('取引履歴クエリ結果:', { count: allTransactions.length })

    // 残高推移は絞り込み・ページング前の全取引を基準に算出する
    // （1ページ分だけで計算すると各行の残高がずれる）
    const runningBalanceMap = buildRunningBalanceMap(allTransactions)

    // 統計値も絞り込み前の全取引が対象（画面の「全体」表示用）
    const approvedTransactions = allTransactions.filter(isApprovedTransaction)
    const stats: TransactionStats = {
      totalCount: allTransactions.length,
      totalDeposits: sumTransactionsBtc(allTransactions, 'deposit'),
      totalWithdrawals: sumTransactionsBtc(allTransactions, 'withdrawal'),
      approvedCount: approvedTransactions.length,
      approvedDeposits: sumTransactionsBtc(approvedTransactions, 'deposit'),
      approvedWithdrawals: sumTransactionsBtc(approvedTransactions, 'withdrawal'),
      pendingCount: allTransactions.filter(t => t.status === TRANSACTION_STATUS.PENDING).length
    }

    let transactions = allTransactions

    // Filter by transaction type if specified
    if (transactionType && ['deposit', 'withdrawal'].includes(transactionType)) {
      transactions = transactions.filter(t => t.transaction_type === transactionType)
    }

    // Get user information for the authenticated user
    const usersTableName = dynamodb.getTableName('users')
    let userName = 'Unknown User'
    let userEmail = 'Unknown Email'
    
    try {
      const user = await dynamodb.get(usersTableName, { user_id: currentUser.user_id })
      if (user) {
        const userData = user as User
        userName = userData.name || 'Unknown User'
        userEmail = userData.email || 'Unknown Email'
      }
    } catch (error: unknown) {
      logger.error(`ユーザー ${currentUser.user_id} の取得に失敗:`, error)
    }

    // Enrich transactions with user data
    const enrichedTransactions: EnrichedTransaction[] = transactions.map(transaction => ({
      ...transaction,
      user_name: userName,
      user_email: userEmail,
      running_balance: runningBalanceMap.get(transaction.transaction_id) ?? 0
    }))

    // Simple pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedTransactions = enrichedTransactions.slice(startIndex, endIndex)

    const response: PaginatedResponse<EnrichedTransaction, TransactionStats> = {
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
      stats
    })

    return {
      success: true,
      data: response
    }
  } catch (error: unknown) {
    logger.error('取引取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch transactions'
    })
  }
})