import { GetUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import type { AuthUser } from '~/types'
import { createSessionFromEvent } from '~/server/utils/session'
import { getCognitoGroups } from '~/server/utils/cognito-groups'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getUserPermissionsByGroups } from '~/server/utils/permission-helpers'
import { useLogger } from '~/composables/useLogger'

const logger = useLogger({ prefix: '[API-PROCESS-AUTH]' })

interface ProcessAuthResultRequest {
  authResult: {
    AccessToken: string
    IdToken: string
    RefreshToken?: string
  }
  email: string
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ProcessAuthResultRequest>(event)
    const { authResult, email } = body

    if (!authResult?.AccessToken || !authResult?.IdToken || !email) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Authentication result and email are required'
      })
    }

    const { AccessToken, IdToken, RefreshToken } = authResult
    const client = createCognitoClient()

    // Get user details from Cognito
    const getUserCommand = new GetUserCommand({
      AccessToken: AccessToken
    })

    const userResponse = await client.send(getUserCommand)
    
    if (!userResponse.UserAttributes) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to get user details'
      })
    }

    // Extract user attributes
    const attributes = userResponse.UserAttributes.reduce((acc, attr) => {
      if (attr.Name && attr.Value) {
        acc[attr.Name] = attr.Value
      }
      return acc
    }, {} as Record<string, string>)

    // Get user groups from Cognito
    const groups = await getCognitoGroups(attributes.email || email)
    
    // Get permissions dynamically from permission table
    const permissions = await getUserPermissionsByGroups(groups)

    // Create DynamoDB session with tokens and client info
    const sessionId = await createSessionFromEvent(
      event,
      attributes.sub || '',
      AccessToken,
      IdToken,
      RefreshToken,
      permissions,
      groups
    )
    
    // Set HTTP-only session cookie (only session_id, no tokens)
    setCookie(event, 'session_id', sessionId, {
      httpOnly: true,
      secure: !import.meta.dev, // ローカル開発(http)のみfalse
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 // 24 hours
    })

    const authUser: AuthUser = {
      user_id: attributes.sub || '',
      email: attributes.email || email,
      name: attributes.name || '',
      groups,
      permissions
    }

    return {
      success: true,
      data: authUser
    }
  } catch (error: unknown) {
    logger.error('認証結果処理エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})