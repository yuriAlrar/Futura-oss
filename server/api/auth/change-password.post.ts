import { CognitoIdentityProviderClient, ChangePasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import type { ChangePasswordRequest } from '~/types'

export default defineEventHandler(async (event) => {
  try {
    await requireAuth(event)
    const body = await readBody<ChangePasswordRequest>(event)
    const { currentPassword, newPassword } = body

    // Validation
    if (!currentPassword || !newPassword) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Current password and new password are required'
      })
    }

    if (newPassword.length < 8) {
      throw createError({
        statusCode: 400,
        statusMessage: 'New password must be at least 8 characters long'
      })
    }

    if (!/(?=.*[a-z])/.test(newPassword)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'New password must contain at least one lowercase letter'
      })
    }

    if (!/(?=.*\d)/.test(newPassword)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'New password must contain at least one number'
      })
    }

    if (currentPassword === newPassword) {
      throw createError({
        statusCode: 400,
        statusMessage: 'New password must be different from current password'
      })
    }

    // Get session ID from cookie
    const sessionId = getCookie(event, 'session_id')
    
    if (!sessionId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Session not found'
      })
    }

    // Get session details
    const session = await getSessionDetails(sessionId)
    const accessToken = session?.cognito_access_token
    
    if (!accessToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Access token not found'
      })
    }

    const config = useRuntimeConfig()
    const cognitoClient = new CognitoIdentityProviderClient({
      region: config.awsRegion
    })

    // Change password in Cognito
    const changePasswordCommand = new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword
    })

    await cognitoClient.send(changePasswordCommand)

    return {
      success: true,
      message: 'Password changed successfully'
    }
  } catch (error: unknown) {
    console.error('パスワード変更エラー:', error)
    
    // Handle Cognito specific errors
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotAuthorizedException') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Current password is incorrect'
      })
    }

    if (error && typeof error === 'object' && 'name' in error && error.name === 'InvalidPasswordException') {
      throw createError({
        statusCode: 400,
        statusMessage: 'New password does not meet requirements'
      })
    }

    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to change password'
    })
  }
})