import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { User } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[ListSubAccounts]' })

  try {
    const currentUser = await requireAuth(event)

    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')

    const result = await dynamodb.query(
      usersTableName,
      'parent_user_id = :parent_user_id',
      { ':parent_user_id': currentUser.user_id },
      { indexName: 'ParentUserIndex' }
    )

    return {
      success: true,
      data: { items: result.items as User[] }
    }
  } catch (error: unknown) {
    logger.error('サブアカウント一覧取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch sub-accounts'
    })
  }
})
