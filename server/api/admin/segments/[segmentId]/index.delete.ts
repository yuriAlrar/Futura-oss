import { getSegment, deleteSegment } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentDelete]' })

  try {
    await requirePermission(event, 'segment:delete')

    const segmentId = getRouterParam(event, 'segmentId')
    if (!segmentId) {
      throw createError({ statusCode: 400, statusMessage: 'Segment ID is required' })
    }

    const existing = await getSegment(segmentId)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Segment not found' })
    }

    await deleteSegment(segmentId)

    return {
      success: true,
      message: 'Segment deleted successfully'
    }
  } catch (error: unknown) {
    logger.error('セグメント削除エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete segment'
    })
  }
})
