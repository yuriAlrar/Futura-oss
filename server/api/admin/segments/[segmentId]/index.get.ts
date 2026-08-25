import { getSegment, getUsersInSegment } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentGet]' })

  try {
    await requirePermission(event, 'segment:read')

    const segmentId = getRouterParam(event, 'segmentId')
    if (!segmentId) {
      throw createError({ statusCode: 400, statusMessage: 'Segment ID is required' })
    }

    const segment = await getSegment(segmentId)
    if (!segment) {
      throw createError({ statusCode: 404, statusMessage: 'Segment not found' })
    }

    const members = await getUsersInSegment(segmentId)

    return {
      success: true,
      data: { ...segment, members }
    }
  } catch (error: unknown) {
    logger.error('セグメント取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch segment'
    })
  }
})
