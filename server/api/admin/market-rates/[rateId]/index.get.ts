import { getDynamoDBService } from '~/server/utils/dynamodb'
import { requirePermission } from '~/server/utils/auth'
import { useLogger } from '~/composables/useLogger'
import type { MarketRate, ApiResponse } from '~/types'

export default defineEventHandler(async (event): Promise<ApiResponse<MarketRate>> => {
  const logger = useLogger({ prefix: '[MarketRateGet]' })
  try {
    // Require admin permission
    await requirePermission(event, 'market_rate:read')

    const rateId = getRouterParam(event, 'rateId')

    if (!rateId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Rate ID is required'
      })
    }

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('market_rates')

    // rate_idはパーティションキーのためqueryで取得する
    const result = await dynamodb.query(
      tableName,
      'rate_id = :rate_id',
      { ':rate_id': rateId }
    )

    if (!result || !result.items || result.items.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Market rate not found'
      })
    }

    const marketRate = result.items[0]

    return {
      success: true,
      data: marketRate as MarketRate,
      message: 'Market rate retrieved successfully'
    }
  } catch (error: unknown) {
    logger.error('市場レート取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retrieve market rate'
    })
  }
})