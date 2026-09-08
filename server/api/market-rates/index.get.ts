import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import { toStatsDateString, todayStatsDateString } from '~/server/utils/stats-helpers'
import type { MarketRate, PaginatedResponse, MarketRateStats } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[MarketRatesGet]' })
  try {
    // Require permission to read market rates
    await requirePermission(event, 'market_rate:read')

    const query = getQuery(event)
    const page = Number(query.page) || 1
    const limit = Math.min(Number(query.limit) || 50, 100)

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('market_rates')

    // Get market rates sorted by timestamp (newest first)
    // scanは全件取得されるためlimitは指定しない（指定しても件数は絞られない）
    const result = await dynamodb.scan(tableName)

    let rates = result.items as MarketRate[]

    // Sort by timestamp descending (newest first)
    rates = rates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // 統計値はページングと無関係に全件が対象
    const today = todayStatsDateString()
    const stats: MarketRateStats = {
      totalCount: rates.length,
      todayUpdateCount: rates.filter(rate => toStatsDateString(rate.created_at) === today).length,
      monthlyChangePercent: calculateMonthlyChangePercent(rates)
    }

    // Simple pagination logic
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedRates = rates.slice(startIndex, endIndex)

    const response: PaginatedResponse<MarketRate, MarketRateStats> = {
      items: paginatedRates,
      total: rates.length,
      page,
      limit,
      hasMore: endIndex < rates.length,
      stats
    }

    return {
      success: true,
      data: response
    }
  } catch (error: unknown) {
    logger.error('市場レート取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch market rates'
    })
  }
})

/**
 * 直近レートと30日前のレートを比較して変化率（%）を算出する
 * rates は timestamp の降順で並んでいる前提
 */
function calculateMonthlyChangePercent(rates: MarketRate[]): number {
  if (rates.length < 2) return 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recent = rates[0]
  const monthAgo = rates.find(rate => new Date(rate.timestamp) <= thirtyDaysAgo)

  if (!monthAgo || !monthAgo.btc_jpy_rate) return 0

  const change = ((recent.btc_jpy_rate - monthAgo.btc_jpy_rate) / monthAgo.btc_jpy_rate) * 100
  return Math.round(change * 100) / 100
}