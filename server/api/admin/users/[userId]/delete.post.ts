import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getDynamoDBService } from '~/server/utils/dynamodb'

export default defineEventHandler(async (event) => {
  // Require admin permission
  const currentUser = await requirePermission(event, 'user:delete')

  const userId = getRouterParam(event, 'userId')
  
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  // 自分自身を削除しようとしていないかチェック
  if (currentUser.user_id === userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete yourself'
    })
  }
  
  try {

    const config = useRuntimeConfig()
    const cognitoClient = createCognitoClient()

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('users')

    // Get user from DynamoDB
    const user = await dynamodb.get(tableName, { user_id: userId })
    
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    if (user.status === 'deleted') {
      throw createError({
        statusCode: 400,
        statusMessage: 'User is already deleted'
      })
    }

    // Delete user from Cognito (physical deletion)
    const deleteUserCommand = new AdminDeleteUserCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: user.email
    })

    await cognitoClient.send(deleteUserCommand)

    // Logical deletion in DynamoDB (keep record for audit)
    const updatedUser = await dynamodb.update(
      tableName,
      { user_id: userId },
      'SET #status = :status, updated_at = :updated_at, deleted_at = :deleted_at',
      {
        ':status': 'deleted',
        ':updated_at': new Date().toISOString(),
        ':deleted_at': new Date().toISOString()
      },
      {
        '#status': 'status'
      }
    )

    return {
      success: true,
      data: updatedUser,
      message: 'User deleted successfully'
    }
  } catch (error: unknown) {
    console.error('Delete user error:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    // Handle case where user doesn't exist in Cognito but exists in DynamoDB
    if (error && typeof error === 'object' && 'name' in error && error.name === 'UserNotFoundException') {
      const dynamodb = getDynamoDBService()
      const tableName = dynamodb.getTableName('users')
      
      // Still perform logical deletion in DynamoDB
      const updatedUser = await dynamodb.update(
        tableName,
        { user_id: userId },
        'SET #status = :status, updated_at = :updated_at, deleted_at = :deleted_at',
        {
          ':status': 'deleted',
          ':updated_at': new Date().toISOString(),
          ':deleted_at': new Date().toISOString()
        },
        {
          '#status': 'status'
        }
      )

      return {
        success: true,
        data: updatedUser,
        message: 'User deleted successfully'
      }
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete user'
    })
  }
})