import { removeUserFromSegment } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentRemoveUser]' })

  try {
    await requirePermission(event, 'segment:update')

    const segmentId = getRouterParam(event, 'segmentId')
    const userId = getRouterParam(event, 'userId')
    if (!segmentId || !userId) {
      throw createError({ statusCode: 400, statusMessage: 'Segment ID and User ID are required' })
    }

    await removeUserFromSegment(segmentId, userId)

    return {
      success: true,
      message: 'User removed from segment successfully'
    }
  } catch (error: unknown) {
    logger.error('セグメントからのユーザー削除エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove user from segment'
    })
  }
})
