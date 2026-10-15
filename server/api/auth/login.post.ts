import { InitiateAuthCommand, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import type { AuthUser, LoginCredentials } from '~/types'
import { createSessionFromEvent } from '~/server/utils/session'
import { getCognitoGroups } from '~/server/utils/cognito-groups'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getUserPermissionsByGroups } from '~/server/utils/permission-helpers'
import { syncCognitoToDatabase } from '~/server/utils/cognito-sync'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'

const logger = useLogger({ prefix: '[API-AUTH-LOGIN]' })

/**
 * 初回ログイン時の自動同期チェック
 * 管理者ユーザーが初回ログインした際に、DBが空かどうかをチェックして自動的に同期を実行
 */
async function checkAndSyncIfNeeded(groups: string[], email: string): Promise<void> {
  // 管理者ユーザーのみチェック
  if (!groups.includes('administrator')) {
    logger.debug(`ユーザー ${email} は管理者ではないため、同期チェックをスキップ`)
    return
  }

  try {
    logger.info(`=== 管理者ユーザー ${email} の初回ログインを検出、DB状態をチェック中... ===`)

    const dynamoDB = getDynamoDBService()

    // ユーザーテーブルの件数をチェック
    logger.info('ユーザーテーブルのレコード数をチェック中...')
    const usersTableName = dynamoDB.getTableName('users')
    logger.debug(`テーブル名解決: users -> ${usersTableName}`)
    const usersScanResult = await dynamoDB.scan(usersTableName, {
      select: 'COUNT'
    })

    logger.info(`ユーザーテーブルのレコード数: ${usersScanResult.count}`)

    // ユーザーが存在しない場合は初回デプロイと判断
    if (usersScanResult.count === 0) {
      logger.info('=== DBが空のため、初回デプロイと判断。Cognito同期を実行中... ===')

      try {
        const syncResults = await syncCognitoToDatabase()
        logger.info('=== 初回同期完了 ===')
        logger.info(`ユーザー同期: ${syncResults.users.synced}件成功, ${syncResults.users.errors}件エラー`)
        logger.info(`権限同期: ${syncResults.permissions.synced}件成功, ${syncResults.permissions.errors}件エラー`)
        logger.info(`グループ同期: ${syncResults.groups.synced}件成功, ${syncResults.groups.errors}件エラー`)
      } catch (syncError) {
        logger.error('=== 初回同期エラー ===')
        logger.error('エラー詳細:', syncError)
        logger.error('スタックトレース:', (syncError as Error).stack)
        // 同期エラーでもログインは続行（フォールバック）
      }
    } else {
      logger.info(`DBに${usersScanResult.count}件のユーザーが存在するため、同期は不要`)
    }
  } catch (error) {
    logger.error('=== DB状態チェックエラー、同期はスキップ ===')
    logger.error('エラー詳細:', error)
    logger.error('スタックトレース:', (error as Error).stack)
    // エラーが発生してもログインは続行
  }
}

export default defineEventHandler(async (event) => {
  try {
    logger.debug('ログインリクエストが開始されました')
    const body = await readBody<LoginCredentials>(event)
    const { email, password } = body
    logger.info('ログイン試行:', email)

    if (!email || !password) {
      logger.warn('メールアドレスまたはパスワードが不足しています')
      throw createError({
        statusCode: 400,
        statusMessage: 'Email and password are required'
      })
    }

    const config = useRuntimeConfig()
    logger.debug('設定 ClientId:', config.cognitoClientId as string)
    const client = createCognitoClient()
    logger.debug('Cognitoクライアントが作成されました')

    // Authenticate with Cognito
    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.cognitoClientId as string,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    })

    logger.debug('Cognitoに認証コマンドを送信中...')
    const authResponse = await client.send(authCommand)
    logger.debug('認証レスポンスを受信:', authResponse.ChallengeName || 'SUCCESS')
    logger.debug('セッション作成を開始...')
    
    // Handle password challenge (FORCE_CHANGE_PASSWORD)
    if (authResponse.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      return {
        success: false,
        data: {
          challenge: 'NEW_PASSWORD_REQUIRED',
          session: authResponse.Session,
          message: 'Password change required'
        },
        message: 'Password change required'
      }
    }
    
    if (!authResponse.AuthenticationResult?.AccessToken || !authResponse.AuthenticationResult?.IdToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }
    
    const { AccessToken, IdToken, RefreshToken } = authResponse.AuthenticationResult

    // Get user details
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
    // 取得に失敗した場合はグループなし（権限なし）として扱う。メールアドレス等からの推測はしない
    const groups = await getCognitoGroups(attributes.email || '')
    logger.debug('ユーザーグループを取得:', groups)

    // 初回ログイン時の自動同期チェック
    await checkAndSyncIfNeeded(groups, attributes.email || '')

    // Get permissions dynamically from permission table
    logger.debug('権限を取得中...')
    const permissions = await getUserPermissionsByGroups(groups)
    logger.debug(`権限取得完了: ${permissions.length}個の権限`)

    // Create DynamoDB session with tokens and client info
    logger.debug('ユーザーのセッションを作成中:', attributes.sub)
    const sessionId = await createSessionFromEvent(
      event,
      attributes.sub || '',
      AccessToken,
      IdToken,
      RefreshToken,
      permissions,
      groups
    )
    logger.info('セッションが作成されました ID:', sessionId)
    
    // Set HTTP-only session cookie (only session_id, no tokens)
    logger.debug('セッションcookieを設定中...')
    setCookie(event, 'session_id', sessionId, {
      httpOnly: true,
      secure: !import.meta.dev, // ローカル開発(http)のみfalse
      sameSite: 'lax', // strictからlaxに変更
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/' // パスを明示的に設定
    })
    logger.debug('セッションcookieが正常に設定されました')

    const authUser: AuthUser = {
      user_id: attributes.sub || '',
      email: attributes.email || '',
      name: attributes.name || '',
      groups,
      permissions
    }

    return {
      success: true,
      data: authUser
    }
  } catch (error: unknown) {
    logger.error('ログインエラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    // AWS Cognito authentication errors
    if (error && typeof error === 'object' && 'name' in error) {
      const errorName = (error as any).name
      
      if (errorName === 'NotAuthorizedException') {
        return {
          success: false,
          message: 'Invalid email or password'
        }
      }
      
      if (errorName === 'UserNotFoundException') {
        return {
          success: false,
          message: 'Invalid email or password'
        }
      }
      
      if (errorName === 'UserNotConfirmedException') {
        return {
          success: false,
          message: 'User account not confirmed'
        }
      }
      
      if (errorName === 'TooManyRequestsException') {
        return {
          success: false,
          message: 'Too many login attempts. Please try again later.'
        }
      }
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})