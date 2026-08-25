import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { MarketRateCreateForm } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminCreateMarketRate]' })
  try {
    const currentUser = await requirePermission(event, 'market_rate:create')

    const body = await readBody<MarketRateCreateForm>(event)
    const { timestamp, btc_jpy_rate } = body

    if (!timestamp || !btc_jpy_rate) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Timestamp and rate are required'
      })
    }

    if (btc_jpy_rate <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Rate must be positive'
      })
    }

    const rateDate = new Date(timestamp)
    if (isNaN(rateDate.getTime())) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid timestamp format'
      })
    }

    const dynamodb = getDynamoDBService()
    const ratesTableName = dynamodb.getTableName('market_rates')
    const rateId = Math.floor(rateDate.getTime() / 1000).toString()
    const now = new Date().toISOString()

    const existingRate = await dynamodb.get(ratesTableName, { rate_id: rateId, timestamp })
    if (existingRate) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Market rate for this timestamp already exists'
      })
    }

    const marketRate = {
      rate_id: rateId,
      timestamp,
      btc_jpy_rate,
      created_by: currentUser.user_id,
      created_at: now
    }

    await dynamodb.put(ratesTableName, marketRate)

    logger.info(`内部レートを設定しました: ${rateId} - ${currentUser.email} - ¥${btc_jpy_rate}`)

    return {
      success: true,
      data: marketRate,
      message: 'Market rate created successfully'
    }
  } catch (error: unknown) {
    logger.error('内部レート設定エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create market rate'
    })
  }
})
