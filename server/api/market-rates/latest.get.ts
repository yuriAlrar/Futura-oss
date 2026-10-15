import { getLatestMarketRate } from '~/server/utils/market-rate-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (_event) => {
  const logger = useLogger({ prefix: '[LatestMarketRate]' })
  try {
    const latestRate = await getLatestMarketRate()

    if (!latestRate) {
      return {
        success: true,
        data: [],
        message: 'No market rates found'
      }
    }

    return {
      success: true,
      data: latestRate
    }
  } catch (error: unknown) {
    logger.error('最新市場レート取得エラー:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch latest market rate'
    })
  }
})