import { getDynamoDBService } from '~/server/utils/dynamodb'
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

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('market_rates')

    // scanは順序を保証しないため全件取得してから新しい順にソートする
    const result = await dynamodb.scan(tableName)

    let rates = result.items as MarketRate[]
    
    // Sort by timestamp descending (newest first)
    rates = rates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

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