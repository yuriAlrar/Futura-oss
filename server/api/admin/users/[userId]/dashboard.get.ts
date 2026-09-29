import { getDynamoDBService } from '~/server/utils/dynamodb'
import { getAllMarketRatesDesc } from '~/server/utils/market-rate-helpers'
import {
  calculateBalance,
  calculateBalanceAtDate,
  calculateDepositPrincipal,
  calculateWithdrawalTotal,
  calculateCreditBonus,
  calculateNetProfit
} from '~/server/utils/transaction-helpers'
import { useLogger } from '~/composables/useLogger'
import type { Transaction, MarketRate, DashboardData, BalanceHistoryItem } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminUserDashboard]' })
  try {
    // Require user:read permission
    await requirePermission(event, 'user:read')

    const userId = getRouterParam(event, 'userId')

    if (!userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'User ID is required'
      })
    }

    logger.debug(`ユーザーダッシュボードデータ取得: ${userId}`)

    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const usersTableName = dynamodb.getTableName('users')

    // Verify user exists
    const user = await dynamodb.get(usersTableName, { user_id: userId })
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get user's transactions
    const transactionsResult = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': userId },
      {
        indexName: 'UserTimestampIndex',
        scanIndexForward: false // Sort by timestamp descending
      }
    )

    const transactions = transactionsResult.items as Transaction[]

    // Calculate current BTC balance (承認済み取引のみ対象)
    const currentBalance = calculateBalance(transactions)

    // Calculate dashboard statistics (承認済み取引のみ対象)
    const depositPrincipal = calculateDepositPrincipal(transactions)
    const withdrawalTotal = calculateWithdrawalTotal(transactions)
    const creditBonus = calculateCreditBonus(transactions)
    const netProfit = calculateNetProfit(currentBalance, depositPrincipal, withdrawalTotal)

    // Get market rates
    const rates = await getAllMarketRatesDesc()

    // Calculate current value in JPY
    const currentRate = rates[0]
    const currentValue = currentRate ? currentBalance * currentRate.btc_jpy_rate : 0

    // Generate balance history (last 30 days)
    const balanceHistory = generateBalanceHistory(transactions, rates)

    // Get recent transactions (last 10)
    const recentTransactions = transactions.slice(0, 10)

    const dashboardData: DashboardData = {
      currentBalance,
      currentValue,
      depositPrincipal,
      withdrawalTotal,
      creditBonus,
      netProfit,
      balanceHistory,
      recentTransactions
    }

    logger.info(`ユーザーダッシュボードデータ取得完了: ${userId}`)

    return {
      success: true,
      data: dashboardData
    }
  } catch (error: unknown) {
    logger.error('ユーザーダッシュボードデータ取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user dashboard data'
    })
  }
})

function generateBalanceHistory(
  transactions: Transaction[],
  rates: MarketRate[]
): BalanceHistoryItem[] {
  const history: BalanceHistoryItem[] = []
  const today = new Date()

  // Generate data for the last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    // Calculate balance up to this date (承認済み取引のみ対象)
    const btcAmount = calculateBalanceAtDate(transactions, date)

    // Find the closest rate for this date
    const relevantRates = rates.filter(r => new Date(r.timestamp) <= date)
    const closestRate = relevantRates[0] // Already sorted by timestamp desc
    const btcRate = closestRate?.btc_jpy_rate || 0
    const jpyValue = btcAmount * btcRate

    history.push({
      date: dateStr,
      btc_amount: btcAmount,
      jpy_value: jpyValue,
      btc_rate: btcRate
    })
  }

  return history
}
