import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { User } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[ProfileGet]' })
  try {
    const currentUser = await requireAuth(event)
    
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('users')

    // Get user profile from DynamoDB
    const user = await dynamodb.get(tableName, { user_id: currentUser.user_id })
    
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User profile not found'
      })
    }

    const userProfile = user as User

    return {
      success: true,
      data: {
        user_id: userProfile.user_id,
        email: userProfile.email,
        name: userProfile.name,
        address: userProfile.address,
        phone_number: userProfile.phone_number,
        btc_address: userProfile.btc_address,
        profile_image_url: userProfile.profile_image_url,
        profile_approved: userProfile.profile_approved,
        status: userProfile.status,
        created_at: userProfile.created_at,
        updated_at: userProfile.updated_at,
        parent_user_id: userProfile.parent_user_id
      }
    }
  } catch (error: unknown) {
    logger.error('プロフィール取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch profile'
    })
  }
})