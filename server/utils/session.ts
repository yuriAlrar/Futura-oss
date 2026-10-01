// 1. 外部ライブラリ
import { GetUserCommand } from '@aws-sdk/client-cognito-identity-provider'

// 2. 内部server utils
import { generateSessionId } from './uuid'

// 3. Nuxt/H3関連
import type { H3Event } from 'h3'
import { getHeader, getCookie, deleteCookie } from 'h3'

// 4. 内部server utils  
import { getDynamoDBService } from './dynamodb'
import { getCognitoGroups } from './cognito-groups'
import { createCognitoClient } from './client-factory'
import { getUserPermissionsByGroups } from './permission-helpers'

// 5. 内部composables（ユニバーサル）
import { useLogger } from '~/composables/useLogger'

// 6. Types
import type { Session, SessionCreateRequest, AuthUser } from '~/types'

// Server-side logger (useLogger composable使用)
const logger = useLogger({ prefix: '[SERVER-SESSION]' })


/**
 * クライアントIPアドレスを取得
 */
function extractClientIP(event: H3Event): string {
  // プロキシ経由でのIPアドレス取得を考慮
  const forwardedFor = getHeader(event, 'x-forwarded-for')
  const realIP = getHeader(event, 'x-real-ip')
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  // フォールバック
  return '127.0.0.1'
}

/**
 * User-Agentを取得
 */
function getUserAgent(event: H3Event): string {
  return getHeader(event, 'user-agent') || 'Unknown'
}

/**
 * DynamoDBにセッションを作成
 */
export const createSession = async (sessionRequest: SessionCreateRequest): Promise<string> => {
  const dynamodb = getDynamoDBService()
  const tableName = dynamodb.getTableName('sessions')
  
  const sessionId = generateSessionId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24時間後
  
  const session: Session = {
    session_id: sessionId,
    user_id: sessionRequest.user_id,
    cognito_access_token: sessionRequest.cognito_access_token,
    cognito_id_token: sessionRequest.cognito_id_token,
    cognito_refresh_token: sessionRequest.cognito_refresh_token,
    ip_address: sessionRequest.ip_address,
    user_agent: sessionRequest.user_agent,
    login_time: now.toISOString(),
    last_access_time: now.toISOString(),
    status: 'active',
    expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp for TTL
    permissions: sessionRequest.permissions, // Cache permissions in session
    groups: sessionRequest.groups // Cache groups in session
  }
  
  await dynamodb.put(tableName, session as unknown as Record<string, unknown>)
  
  return sessionId
}

/**
 * セッションを検証し、ユーザー情報を取得
 */
export const validateSession = async (sessionId: string): Promise<AuthUser | null> => {
  try {
    logger.info('=== validateSession開始 ===')
    logger.info('Session ID:', sessionId.substring(0, 8) + '...')
    
    logger.info('ステップ1: DynamoDBサービスを取得中...')
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    logger.success('ステップ1: DynamoDBサービスを取得しました')
    
    logger.info('ステップ2: DBからsessionを取得中...')
    const session = await dynamodb.get(tableName, { session_id: sessionId }) as Session | null
    logger.info('ステップ2: DBからのsession:', session ? '見つかりました' : '見つかりません')
    
    if (!session || session.status !== 'active') {
      logger.warn('sessionが見つからないかアクティブではありません:', { exists: !!session, status: session?.status })
      return null
    }
    
    logger.info('ステップ3: sessionの有効期限をチェック中...')
    const now = Math.floor(Date.now() / 1000)
    if (session.expires_at < now) {
      logger.warn('sessionが期限切れです:', { expires_at: session.expires_at, now })
      // セッション期限切れ - 自動的に期限切れに設定
      await invalidateSession(sessionId, 'expired')
      return null
    }
    logger.success('ステップ3: sessionは期限切れではありません')
    
    logger.info('ステップ4: verifyAuthTokenFromSessionを呼び出し中...')
    const authUser = await verifyAuthTokenFromSession(session)
    logger.info('ステップ4: verifyAuthTokenFromSession結果:', authUser ? `成功: ${authUser.email}` : '失敗')
    
    if (!authUser) {
      logger.warn('認証token検証に失敗しました')
      // トークンが無効 - セッション無効化
      await invalidateSession(sessionId, 'revoked')
      return null
    }
    
    logger.info('ステップ5: 最終アクセス時刻を更新中...')
    await updateLastAccessTime(sessionId)
    logger.success('ステップ5: 最終アクセス時刻を更新しました')
    
    logger.success('=== validateSession終了 ===')
    return authUser
  } catch (error) {
    logger.error('=== validateSessionエラー ===')
    logger.error('エラータイプ:', typeof error)
    logger.error('エラーメッセージ:', error instanceof Error ? error.message : String(error))
    logger.error('エラースタック:', error instanceof Error ? error.stack : 'スタックトレースなし')
    return null
  }
}

/**
 * セッションからCognitoトークンを使用してユーザー情報を取得
 */
export const verifyAuthTokenFromSession = async (session: Session): Promise<AuthUser | null> => {
  try {
    logger.info('=== verifyAuthTokenFromSession開始 ===')
    
    logger.info('ステップA: Cognitoクライアントを作成中...')
    const client = createCognitoClient()
    logger.success('ステップA: Cognitoクライアントを正常に作成しました')
    
    logger.info('ステップB: CognitoにGetUserコマンドを送信中...')
    const userResponse = await client.send(new GetUserCommand({
      AccessToken: session.cognito_access_token
    }))
    logger.success('ステップB: GetUserコマンドが正常に完了しました')
    
    if (!userResponse.UserAttributes) {
      logger.warn('レスポンスにユーザー属性がありません')
      return null
    }
    
    logger.info('ステップC: ユーザー属性を処理中...')
    const attributes = userResponse.UserAttributes.reduce((acc, attr) => {
      if (attr.Name && attr.Value) acc[attr.Name] = attr.Value
      return acc
    }, {} as Record<string, string>)
    logger.success('ステップC: ユーザー属性を処理しました:', Object.keys(attributes))
    
    logger.info('ステップD: セッションから権限とグループを取得中...')
    let groups: string[] = session.groups || []
    let permissions: string[] = session.permissions || []
    
    // セッションに権限情報がない場合はDB参照
    if (!permissions || permissions.length === 0 || !groups || groups.length === 0) {
      logger.info('セッションに権限情報がない、DBから取得中...')
      
      // 取得に失敗した場合はグループなし（権限なし）として扱う。メールアドレス等からの推測はしない
      groups = await getCognitoGroups(attributes.email || '')
      logger.success('ステップD: グループを取得しました:', groups)
      
      logger.info('ステップE: 権限を決定中...')
      permissions = await getUserPermissionsByGroups(groups)
      
      // セッションに権限情報を追記
      logger.info('セッションに権限情報を追記中...')
      await updateSessionPermissions(session.session_id, permissions, groups)
      logger.success('セッションの権限情報を更新しました')
    } else {
      logger.success('セッションから権限情報を取得しました', `${permissions.length}個の権限`)
    }
    
    logger.info('ステップF: AuthUserオブジェクトを作成中...')
    const authUser = {
      user_id: attributes.sub || '',
      email: attributes.email || '',
      name: attributes.name || '',
      groups,
      permissions
    }
    logger.success('=== verifyAuthTokenFromSession終了 ===')
    logger.info('AuthUserを作成しました:', authUser.email)
    
    return authUser
  } catch (error) {
    logger.error('=== verifyAuthTokenFromSessionエラー ===')
    logger.error('エラータイプ:', typeof error)
    logger.error('エラーメッセージ:', error instanceof Error ? error.message : String(error))
    logger.error('エラースタック:', error instanceof Error ? error.stack : 'スタックトレースなし')
    logger.error('エラー詳細:', JSON.stringify(error, null, 2))
    return null
  }
}

/**
 * セッションの最終アクセス時刻を更新
 */
export const updateLastAccessTime = async (sessionId: string): Promise<void> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    await dynamodb.update(
      tableName,
      { session_id: sessionId },
      'SET last_access_time = :time',
      { ':time': new Date().toISOString() }
    )
  } catch (error) {
    // 最終アクセス時刻の更新に失敗してもセッション検証は継続
    logger.warn('最終アクセス時刻の更新に失敗しました:', error)
  }
}

/**
 * セッションを無効化
 */
export const invalidateSession = async (sessionId: string, reason: 'expired' | 'revoked' = 'revoked'): Promise<void> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    await dynamodb.update(
      tableName,
      { session_id: sessionId },
      'SET #status = :status',
      { ':status': reason },
      { '#status': 'status' }
    )
  } catch (error) {
    logger.error('session無効化エラー:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to invalidate session'
    })
  }
}

/**
 * ユーザーの全セッションを無効化
 */
export const invalidateAllUserSessions = async (userId: string): Promise<void> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    // ユーザーのアクティブセッションを検索
    const result = await dynamodb.query(
      tableName,
      'user_id = :user_id AND #status = :status',
      { ':user_id': userId, ':status': 'active' },
      {
        indexName: 'UserStatusIndex', // GSIが必要
        expressionAttributeNames: { '#status': 'status' }
      }
    )
    
    const sessions = result.items as Session[]
    
    // 全セッションを無効化
    for (const session of sessions) {
      await invalidateSession(session.session_id, 'revoked')
    }
  } catch (error) {
    logger.error('全ユーザーsessionの無効化に失敗しました:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to invalidate user sessions'
    })
  }
}

/**
 * 全セッション一覧を取得（管理者用）
 */
export const getAllSessions = async (options?: {
  status?: 'active' | 'expired' | 'revoked'
  limit?: number
}): Promise<Session[]> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    let filterExpression = ''
    let expressionAttributeValues = {}
    
    if (options?.status) {
      filterExpression = '#status = :status'
      expressionAttributeValues = { ':status': options.status }
    }
    
    const result = await dynamodb.scan(tableName, {
      filterExpression: filterExpression || undefined,
      expressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      expressionAttributeNames: filterExpression ? { '#status': 'status' } : undefined,
      limit: options?.limit
    })
    
    const sessions = result.items as Session[]
    
    // セッションを作成日時順でソート（新しい順）
    return sessions.sort((a, b) => new Date(b.login_time).getTime() - new Date(a.login_time).getTime())
  } catch (error) {
    logger.error('全sessionの取得に失敗しました:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retrieve sessions'
    })
  }
}

/**
 * 指定ユーザーのセッション一覧を取得
 */
export const getUserSessions = async (userId: string): Promise<Session[]> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    const result = await dynamodb.query(
      tableName,
      'user_id = :user_id',
      { ':user_id': userId },
      {
        indexName: 'UserTimestampIndex', // GSIが必要
        scanIndexForward: false // 新しい順
      }
    )
    
    return result.items as Session[]
  } catch (error) {
    logger.error(`ユーザー${userId}のsession取得に失敗しました:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to retrieve user sessions'
    })
  }
}

/**
 * セッション詳細を取得
 */
export const getSessionDetails = async (sessionId: string): Promise<Session | null> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    const session = await dynamodb.get(tableName, { session_id: sessionId }) as Session | null
    return session
  } catch (error) {
    logger.error(`session${sessionId}の取得に失敗しました:`, error)
    return null
  }
}

/**
 * アクティブセッション数を取得
 */
export const getActiveSessionCount = async (): Promise<number> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    const result = await dynamodb.scan(tableName, {
      filterExpression: '#status = :status',
      expressionAttributeValues: { ':status': 'active' },
      expressionAttributeNames: { '#status': 'status' }
    })
    
    return result.items?.length || 0
  } catch (error) {
    logger.error('アクティブsession数の取得に失敗しました:', error)
    return 0
  }
}

/**
 * セッションに権限情報を追記
 */
export const updateSessionPermissions = async (
  sessionId: string,
  permissions: string[],
  groups: string[]
): Promise<void> => {
  try {
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('sessions')
    
    await dynamodb.update(
      tableName,
      { session_id: sessionId },
      'SET permissions = :permissions, groups = :groups',
      { 
        ':permissions': permissions,
        ':groups': groups
      }
    )
    
    logger.debug(`セッション ${sessionId} の権限情報を更新しました`)
  } catch (error) {
    logger.error('セッション権限情報の更新に失敗:', error)
    // エラーでも続行（権限キャッシュは次回に更新される）
  }
}

/**
 * セッション作成のヘルパー関数（H3Eventから情報を抽出）
 */
export const createSessionFromEvent = async (
  event: H3Event,
  userId: string,
  accessToken: string,
  idToken: string,
  refreshToken?: string,
  permissions?: string[],
  groups?: string[]
): Promise<string> => {
  const sessionRequest: SessionCreateRequest = {
    user_id: userId,
    cognito_access_token: accessToken,
    cognito_id_token: idToken,
    cognito_refresh_token: refreshToken,
    ip_address: extractClientIP(event),
    user_agent: getUserAgent(event),
    permissions,
    groups
  }
  
  return createSession(sessionRequest)
}

/**
 * H3EventのcookieからセッションIDを取得し、AuthUserを返す
 */
export const getCurrentUserFromEvent = async (event: H3Event): Promise<AuthUser | null> => {
  try {
    logger.info('=== getCurrentUserFromEvent開始 ===')
    logger.info('イベントオブジェクト:', typeof event)
    
    logger.info('ステップA: cookieからsession_idを取得中...')
    const sessionId = getCookie(event, 'session_id')
    logger.info('ステップA: sessionId結果:', sessionId ? `見つかりました: ${sessionId.substring(0, 8)}...` : '見つかりません')
    
    if (!sessionId) {
      logger.info('session IDが見つかりません、nullを返します')
      return null
    }

    logger.info('ステップB: validateSessionを呼び出し中...')
    const authUser = await validateSession(sessionId)
    logger.info('ステップB: validateSession結果:', authUser ? `成功: ${authUser.email}` : '失敗')
    
    logger.success('=== getCurrentUserFromEvent終了 ===')
    return authUser
  } catch (error) {
    logger.error('=== getCurrentUserFromEventエラー ===')
    logger.error('エラータイプ:', typeof error)
    logger.error('エラーメッセージ:', error instanceof Error ? error.message : String(error))
    logger.error('エラースタック:', error instanceof Error ? error.stack : 'スタックトレースなし')
    logger.error('エラー詳細:', JSON.stringify(error, null, 2))
    return null
  }
}

/**
 * セッションCookieを破棄する
 */
export const clearSessionCookie = (event: H3Event): void => {
  try {
    deleteCookie(event, 'session_id')
    logger.info('セッションCookieを破棄しました')
  } catch (error) {
    logger.error('セッションCookie破棄中にエラーが発生しました:', error)
  }
}