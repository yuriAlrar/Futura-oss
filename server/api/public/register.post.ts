import { AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminAddUserToGroupCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { getInvite, consumeInvite } from '~/server/utils/invite-helpers'
import { checkRateLimit } from '~/server/utils/rate-limiter'
import { generateUUID } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'
import { INVITE_STATUS } from '~/types'
import type { User, PublicRegisterForm } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[PublicRegister]' })

  try {
    // 未認証エンドポイントのため、招待コード検証の前後どちらでもレート制限をかける
    const clientIp = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
    if (!checkRateLimit(`register:${clientIp}`, 5, 60 * 60 * 1000)) {
      throw createError({ statusCode: 429, statusMessage: 'Too many registration attempts. Please try again later.' })
    }

    const body = await readBody<PublicRegisterForm>(event)
    const { invite_code, email, name, address, phone_number, password } = body

    if (!invite_code || !email || !name || !address || !phone_number || !password) {
      throw createError({ statusCode: 400, statusMessage: 'All fields are required' })
    }

    // パスワードポリシー（8文字以上、小文字・数字必須）のサーバー側検証
    if (password.length < 8 || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Password must be at least 8 characters and include a lowercase letter and a number'
      })
    }

    // 1. 招待コードの有効性チェック
    const invite = await getInvite(invite_code)
    if (!invite || invite.status !== INVITE_STATUS.ACTIVE) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid or already used invite code' })
    }

    // 2. 招待コードを先に消費済みにする（同時アクセスによる二重登録を防止）
    //    この時点では実際のuser_idがまだ無いため、一時的な予約IDを入れておき、
    //    Cognitoユーザー作成が成功した後に実際のuser_idへ更新する
    const reservationId = generateUUID()
    const consumed = await consumeInvite(invite_code, reservationId)
    if (!consumed) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid or already used invite code' })
    }

    const config = useRuntimeConfig()
    const cognitoClient = createCognitoClient()

    try {
      // 3. Cognitoユーザーを作成し、入力されたパスワードをそのまま本パスワードとして確定する
      //    （AdminCreateUser + AdminSetUserPassword(Permanent: true)により、
      //     セルフサインアップAPIやメール確認フローを使わずに完結させる）
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Username: email,
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: name },
          { Name: 'email_verified', Value: 'true' }
        ]
      })

      const cognitoResponse = await cognitoClient.send(createUserCommand)
      if (!cognitoResponse.User?.Username) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to create user in Cognito' })
      }

      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Username: email,
        Password: password,
        Permanent: true
      }))

      await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Username: email,
        GroupName: 'user'
      }))

      const userDetailsResponse = await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Username: email
      }))

      const userAttributes = (userDetailsResponse.UserAttributes || []).reduce((acc, attr) => {
        if (attr.Name && attr.Value) {
          acc[attr.Name] = attr.Value
        }
        return acc
      }, {} as Record<string, string>)

      const userId = userAttributes.sub
      if (!userId) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to get user sub from Cognito' })
      }

      // 4. DynamoDBにユーザーレコードを作成（管理者承認待ち）
      const btcAddress = `1${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
      const dynamodb = getDynamoDBService()
      const usersTableName = dynamodb.getTableName('users')
      const now = new Date().toISOString()

      const newUser: User = {
        user_id: userId,
        email,
        name,
        address,
        phone_number,
        status: 'active',
        profile_approved: false,
        btc_address: btcAddress,
        created_at: now,
        updated_at: now
      }

      await dynamodb.put(usersTableName, newUser as unknown as Record<string, unknown>)

      // 5. 招待コードの consumed_by を実際のuser_idへ更新（ベストエフォート）
      const invitesTableName = dynamodb.getTableName('invites')
      await dynamodb.update(
        invitesTableName,
        { invite_code },
        'SET consumed_by = :consumed_by',
        { ':consumed_by': userId }
      )

      logger.info(`新規登録が完了しました: ${userId} (招待コード: ${invite_code})`)

      return {
        success: true,
        data: { user_id: userId, email },
        message: 'Registration successful. Admin approval is required before full access.'
      }
    } catch (innerError: unknown) {
      // Cognito/DynamoDB側の処理に失敗した場合、招待コードの再利用はできない
      // （モック運用のため、失敗時の招待コード復活は行わない。管理者が再発行で対応する）
      logger.error('登録処理中にエラーが発生しました（招待コードは消費済みのままです）:', innerError)
      throw innerError
    }
  } catch (error: unknown) {
    logger.error('新規登録エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    if (error && typeof error === 'object' && 'name' in error && error.name === 'UsernameExistsException') {
      throw createError({ statusCode: 400, statusMessage: 'User already exists' })
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to register'
    })
  }
})
