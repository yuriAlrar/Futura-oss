import { AdminDisableUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getDynamoDBService } from '~/server/utils/dynamodb'

export default defineEventHandler(async (event) => {
  try {
    // 管理者権限が必要
    const currentUser = await requirePermission(event, 'user:update')

    const userId = getRouterParam(event, 'userId')
    
    if (!userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'User ID is required'
      })
    }

    const config = useRuntimeConfig()
    const cognitoClient = createCognitoClient()

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('users')

    // 自分自身を停止しようとしていないかチェック
    if (currentUser.user_id === userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot suspend yourself'
      })
    }

    // メールアドレス取得のためDynamoDBからユーザーを取得
    const user = await dynamodb.get(tableName, { user_id: userId })
    
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    if (user.status === 'suspended') {
      throw createError({
        statusCode: 400,
        statusMessage: 'User is already suspended'
      })
    }

    // Cognitoでユーザーを無効化
    const disableUserCommand = new AdminDisableUserCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: user.email
    })

    await cognitoClient.send(disableUserCommand)

    // DynamoDBでユーザーステータスを更新
    const updatedUser = await dynamodb.update(
      tableName,
      { user_id: userId },
      'SET #status = :status, updated_at = :updated_at',
      {
        ':status': 'suspended',
        ':updated_at': new Date().toISOString()
      },
      {
        '#status': 'status'
      }
    )

    return {
      success: true,
      data: updatedUser,
      message: 'User suspended successfully'
    }
  } catch (error: unknown) {
    console.error('Suspend user error:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to suspend user'
    })
  }
})