import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { User } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[GetParentAccount]' })

  try {
    const currentUser = await requireAuth(event)

    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')

    const self = await dynamodb.get(usersTableName, { user_id: currentUser.user_id }) as User | null

    if (!self?.parent_user_id) {
      return { success: true, data: null }
    }

    const parent = await dynamodb.get(usersTableName, { user_id: self.parent_user_id }) as User | null

    if (!parent) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        user_id: parent.user_id,
        name: parent.name,
        email: parent.email
      }
    }
  } catch (error: unknown) {
    logger.error('親アカウント情報取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch parent account'
    })
  }
})
