import { createSegment } from '~/server/utils/segment-helpers'
import { useLogger } from '~/composables/useLogger'
import type { SegmentCreateForm } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentsCreate]' })

  try {
    const currentUser = await requirePermission(event, 'segment:create')

    const body = await readBody<SegmentCreateForm>(event)
    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Segment name is required'
      })
    }

    const segment = await createSegment(body, currentUser.user_id)

    return {
      success: true,
      data: segment,
      message: 'Segment created successfully'
    }
  } catch (error: unknown) {
    logger.error('セグメント作成エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create segment'
    })
  }
})
