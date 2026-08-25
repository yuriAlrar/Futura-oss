import { getSegment, addUserToSegment } from '~/server/utils/segment-helpers'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminSegmentAddUser]' })

  try {
    await requirePermission(event, 'segment:update')

    const segmentId = getRouterParam(event, 'segmentId')
    if (!segmentId) {
      throw createError({ statusCode: 400, statusMessage: 'Segment ID is required' })
    }

    const segment = await getSegment(segmentId)
    if (!segment) {
      throw createError({ statusCode: 404, statusMessage: 'Segment not found' })
    }

    const body = await readBody<{ user_id: string }>(event)
    if (!body.user_id) {
      throw createError({ statusCode: 400, statusMessage: 'user_id is required' })
    }

    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')
    const user = await dynamodb.get(usersTableName, { user_id: body.user_id })
    if (!user) {
      throw createError({ statusCode: 404, statusMessage: 'User not found' })
    }

    await addUserToSegment(segmentId, body.user_id)

    return {
      success: true,
      message: 'User added to segment successfully'
    }
  } catch (error: unknown) {
    logger.error('セグメントへのユーザー追加エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add user to segment'
    })
  }
})
