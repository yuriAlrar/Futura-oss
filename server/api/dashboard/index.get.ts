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
  const logger = useLogger({ prefix: '[Dashboard]' })
  try {
    const currentUser = await requireAuth(event)
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')

    // Get user's transactions
    const transactionsResult = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': currentUser.user_id },
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

    return {
      success: true,
      data: dashboardData
    }
  } catch (error: unknown) {
    logger.error('ダッシュボードデータ取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch dashboard data'
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