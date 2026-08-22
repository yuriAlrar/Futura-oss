import { listSegments } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentsList]' })

  try {
    await requirePermission(event, 'segment:read')

    const items = await listSegments()

    return {
      success: true,
      data: { items }
    }
  } catch (error: unknown) {
    logger.error('セグメント一覧取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch segments'
    })
  }
})
