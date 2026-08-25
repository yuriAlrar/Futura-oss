import { getSegment, updateSegment } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'
import type { SegmentUpdateForm } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentUpdate]' })

  try {
    await requirePermission(event, 'segment:update')

    const segmentId = getRouterParam(event, 'segmentId')
    if (!segmentId) {
      throw createError({ statusCode: 400, statusMessage: 'Segment ID is required' })
    }

    const existing = await getSegment(segmentId)
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Segment not found' })
    }

    const body = await readBody<SegmentUpdateForm>(event)
    const segment = await updateSegment(segmentId, body)

    return {
      success: true,
      data: segment,
      message: 'Segment updated successfully'
    }
  } catch (error: unknown) {
    logger.error('セグメント更新エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update segment'
    })
  }
})
