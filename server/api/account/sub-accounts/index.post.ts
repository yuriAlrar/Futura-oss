import { AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider'
import { createCognitoClient } from '~/server/utils/client-factory'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { generateTemporaryPassword } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'
import type { User, SubAccountCreateForm, SubAccountCreateResult } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[CreateSubAccount]' })
  try {
    // ログイン済みの本アカウントが自身に紐づくサブアカウントを作成する
    // （招待コードは不要。認証済みであること自体が本人確認の代替になる）
    const currentUser = await requirePermission(event, 'account:create-sub')

    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')

    // サブアカウント自身からさらにサブアカウントを作ることは禁止する（parent_user_idの有無で判定）
    const selfUser = await dynamodb.get(usersTableName, { user_id: currentUser.user_id }) as User | null
    if (selfUser?.parent_user_id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Sub-accounts cannot create further sub-accounts'
      })
    }

    const body = await readBody<SubAccountCreateForm>(event)
    const { email, name } = body

    if (!email || !name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'All fields are required'
      })
    }

    const config = useRuntimeConfig()
    const cognitoClient = createCognitoClient()
    const temporaryPassword = generateTemporaryPassword()

    // Create user in Cognito
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: email,
      TemporaryPassword: temporaryPassword,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name },
        { Name: 'email_verified', Value: 'true' }
      ]
    })

    const cognitoResponse = await cognitoClient.send(createUserCommand)

    if (!cognitoResponse.User?.Username) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create user in Cognito'
      })
    }

    // Add sub-account to default 'user' group（権限グループは本垢・サブ垢で独立して割り当て可能）
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: email,
      GroupName: 'user'
    }))

    // Get sub (user_id) from Cognito attributes
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
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to get user sub from Cognito'
      })
    }

    // Generate dummy BTC address（モック運用のため、ダミーキーで十分）
    const btcAddress = `1${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`

    const now = new Date().toISOString()

    const subAccount: User = {
      user_id: userId,
      email,
      name,
      address: '', // サブアカウント作成時には収集しない。プロフィール画面から後日入力する
      phone_number: '',
      status: 'active',
      profile_approved: false, // 管理者による承認待ち
      btc_address: btcAddress,
      created_at: now,
      updated_at: now,
      parent_user_id: currentUser.user_id
    }

    await dynamodb.put(usersTableName, subAccount as unknown as Record<string, unknown>)

    const result: SubAccountCreateResult = {
      user: subAccount,
      temporary_password: temporaryPassword
    }

    logger.info(`サブアカウントを作成しました: ${userId} (親: ${currentUser.user_id})`)

    return {
      success: true,
      data: result,
      message: 'Sub-account created successfully. Admin approval is still required.'
    }
  } catch (error: unknown) {
    logger.error('サブアカウント作成エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    if (error && typeof error === 'object' && 'name' in error && error.name === 'UsernameExistsException') {
      throw createError({
        statusCode: 400,
        statusMessage: 'User already exists'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create sub-account'
    })
  }
})
