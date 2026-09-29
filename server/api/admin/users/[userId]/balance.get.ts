import { getDynamoDBService } from '~/server/utils/dynamodb'
import { getLatestMarketRate } from '~/server/utils/market-rate-helpers'
import { calculateBalance } from '~/server/utils/transaction-helpers'
import { useLogger } from '~/composables/useLogger'
import type { Transaction } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminUserBalance]' })
  try {
    // Require permission to read user data
    await requirePermission(event, 'user:read')

    const userId = getRouterParam(event, 'userId')
    
    if (!userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'User ID is required'
      })
    }

    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')
    const transactionsTableName = dynamodb.getTableName('transactions')

    // Verify user exists
    const user = await dynamodb.get(usersTableName, { user_id: userId })
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get all transactions for this user
    const result = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': userId },
      {
        indexName: 'UserTimestampIndex'
      }
    )

    const transactions = result.items as Transaction[]
    
    // Calculate balance (承認済み取引のみ対象)
    const balance = calculateBalance(transactions)

    // Get latest market rate for JPY value calculation
    const latestRate = await getLatestMarketRate()
    const jpyValue = latestRate ? balance * latestRate.btc_jpy_rate : 0

    return {
      success: true,
      data: {
        user_id: userId,
        user_name: user.name,
        btc_balance: balance,
        jpy_value: jpyValue,
        transaction_count: transactions.length,
        last_transaction: transactions.length > 0 
          ? transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
          : null
      }
    }
  } catch (error: unknown) {
    logger.error('ユーザー残高取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get user balance'
    })
  }
})