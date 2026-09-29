import { getAllMarketRatesDesc } from '~/server/utils/market-rate-helpers'
import { useLogger } from '~/composables/useLogger'
import type { MarketRate, PaginatedResponse } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[MarketRatesGet]' })
  try {
    // Require permission to read market rates
    await requirePermission(event, 'market_rate:read')

    const query = getQuery(event)
    const page = Number(query.page) || 1
    const limit = Math.min(Number(query.limit) || 50, 100)

    const rates = await getAllMarketRatesDesc()

    // Simple pagination logic
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedRates = rates.slice(startIndex, endIndex)

    const response: PaginatedResponse<MarketRate> = {
      items: paginatedRates,
      total: rates.length,
      page,
      limit,
      hasMore: endIndex < rates.length
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