import { getDynamoDBService } from '~/server/utils/dynamodb'

export default defineEventHandler(async (event) => {
  try {
    // 運用停止ステート: ログイン可否には影響しない。一括資産調整の対象からのみ除外される
    await requirePermission(event, 'user:update')

    const userId = getRouterParam(event, 'userId')
    if (!userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'User ID is required'
      })
    }

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('users')

    const user = await dynamodb.get(tableName, { user_id: userId })
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    if (user.operation_status === 'suspended') {
      throw createError({
        statusCode: 400,
        statusMessage: 'User is already operation-suspended'
      })
    }

    const updatedUser = await dynamodb.update(
      tableName,
      { user_id: userId },
      'SET operation_status = :operation_status, updated_at = :updated_at',
      {
        ':operation_status': 'suspended',
        ':updated_at': new Date().toISOString()
      }
    )

    return {
      success: true,
      data: updatedUser,
      message: 'User operation-suspended successfully'
    }
  } catch (error: unknown) {
    console.error('Operation-suspend user error:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to operation-suspend user'
    })
  }
})
