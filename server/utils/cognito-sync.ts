import { ListUsersCommand, type ListUsersCommandOutput } from '@aws-sdk/client-cognito-identity-provider'
import { createCognitoClient } from './client-factory'
import { getDynamoDBService } from './dynamodb'
import { listCognitoGroups, createCognitoGroup } from './cognito-groups'
import { DEFAULT_GROUP_PERMISSIONS } from './permission-definitions'
import { useLogger } from '~/composables/useLogger'
import type { User } from '~/types'

/**
 * CognitoとDynamoDBの同期を実行
 * 初回デプロイ時や構成変更時に使用
 */
export async function syncCognitoToDatabase(): Promise<{
  users: { synced: number; errors: number }
  permissions: { synced: number; errors: number }
  groups: { synced: number; errors: number }
}> {
  const logger = useLogger({ prefix: '[CognitoSync]' })

  logger.info('=== Cognito同期処理開始 ===')

  const syncResults = {
    users: { synced: 0, errors: 0 },
    permissions: { synced: 0, errors: 0 },
    groups: { synced: 0, errors: 0 }
  }

  try {
    // 1. Usersテーブル同期
    logger.info('=== 1/3: Usersテーブル同期開始 ===')
    syncResults.users = await syncUsersFromCognito()
    logger.info(`Usersテーブル同期完了: ${syncResults.users.synced}件成功, ${syncResults.users.errors}件エラー`)

    // 2. Permissionsテーブル同期
    logger.info('=== 2/3: Permissionsテーブル同期開始 ===')
    syncResults.permissions = await syncPermissionsFromCognito()
    logger.info(`Permissionsテーブル同期完了: ${syncResults.permissions.synced}件成功, ${syncResults.permissions.errors}件エラー`)

    // 3. グループ同期
    logger.info('=== 3/3: グループ同期開始 ===')
    syncResults.groups = await syncGroupsWithCognito()
    logger.info(`グループ同期完了: ${syncResults.groups.synced}件成功, ${syncResults.groups.errors}件エラー`)

    logger.info('=== Cognito同期処理完了 ===')
    logger.info('最終結果:', JSON.stringify(syncResults, null, 2))
    return syncResults
  } catch (error) {
    logger.error('=== Cognito同期処理でエラー発生 ===')
    logger.error('エラー詳細:', error)
    logger.error('スタックトレース:', (error as Error).stack)
    throw error
  }
}

/**
 * CognitoからUsersテーブルを同期
 */
async function syncUsersFromCognito(): Promise<{ synced: number; errors: number }> {
  const logger = useLogger({ prefix: '[UserSync]' })
  
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    const dynamodb = getDynamoDBService()
    
    // Cognitoから全ユーザーをページネーションを使用して取得
    let allCognitoUsers: any[] = []
    let nextToken: string | undefined = undefined
    
    do {
      const listCommand = new ListUsersCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Limit: 60,
        PaginationToken: nextToken
      })
      
      const listResponse = await client.send(listCommand) as ListUsersCommandOutput
      if (listResponse.Users) {
        allCognitoUsers = [...allCognitoUsers, ...listResponse.Users]
      }
      nextToken = listResponse.PaginationToken
    } while (nextToken)
    
    if (allCognitoUsers.length === 0) {
      logger.info('Cognitoにユーザーが見つかりません')
      return { synced: 0, errors: 0 }
    }
    
    logger.info(`Cognitoから合計${allCognitoUsers.length}人のユーザーを取得しました`)
    
    const usersTableName = dynamodb.getTableName('users')
    let syncedCount = 0
    let errorsCount = 0
    
    for (const cognitoUser of allCognitoUsers) {
      try {
        // ユーザー属性を取得
        const attributes = cognitoUser.Attributes?.reduce((acc: Record<string, string>, attr: { Name?: string; Value?: string }) => {
          if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value
          }
          return acc
        }, {} as Record<string, string>) || {}
        
        if (!attributes.sub || !attributes.email) {
          logger.warn('無効なCognitoユーザー（sub/emailなし）をスキップしました')
          continue
        }
        
        // 既存ユーザーは更新しない（DB側で変更した状態・名前をCognitoの値で上書きしないため）
        const existingUser = await dynamodb.get(usersTableName, { user_id: attributes.sub })
        if (existingUser) {
          continue
        }

        // ステータスをマップ
        // 停止中ユーザーもCognitoのUserStatusはCONFIRMEDのままのため、Enabledで判定する
        const status: User['status'] = cognitoUser.Enabled === false ? 'suspended' : 'active'
        
        // Userオブジェクトを作成
        const user: User = {
          user_id: attributes.sub,
          email: attributes.email,
          name: attributes.name || attributes.email,
          status,
          address: '',
          phone_number: '',
          profile_image_url: attributes.picture || undefined,
          profile_approved: false,
          btc_address: '',
          created_at: cognitoUser.UserCreateDate?.toISOString() || new Date().toISOString(),
          updated_at: cognitoUser.UserLastModifiedDate?.toISOString() || new Date().toISOString()
        }
        
        // DBに存在しないユーザーのみ作成する
        await dynamodb.put(usersTableName, user as unknown as Record<string, unknown>)
        logger.info(`新規ユーザーを同期しました: ${user.email}`)
        syncedCount++
      } catch (error) {
        logger.error(`ユーザーの同期中にエラー:`, error)
        errorsCount++
      }
    }
    
    logger.info(`ユーザー同期完了: ${syncedCount}人同期、${errorsCount}件エラー`)
    return { synced: syncedCount, errors: errorsCount }
    
  } catch (error) {
    logger.error('ユーザー同期エラー:', error)
    throw error
  }
}

/**
 * Permissionsテーブルのグループ権限を確認・同期
 */
async function syncPermissionsFromCognito(): Promise<{ synced: number; errors: number }> {
  const logger = useLogger({ prefix: '[PermissionSync]' })
  
  try {
    const dynamodb = getDynamoDBService()
    const permissionsTableName = dynamodb.getTableName('permissions')
    
    // デフォルトグループ権限の定義を使用
    
    const requiredGroups = [
      {
        group_name: 'administrator',
        permissions: DEFAULT_GROUP_PERMISSIONS.administrator,
        description: 'Full system administrator permissions - all features accessible'
      },
      {
        group_name: 'user',
        permissions: DEFAULT_GROUP_PERMISSIONS.user,
        description: 'Standard user permissions for profile and transaction access'
      }
    ]
    
    let syncedCount = 0
    let errorsCount = 0
    
    for (const groupDef of requiredGroups) {
      try {
        // 既存のグループ権限をチェック
        const existingPermission = await dynamodb.get(permissionsTableName, { 
          group_name: groupDef.group_name 
        })
        
        // 権限レコードが存在しない場合のみ既定値で作成する
        // （既存レコードは管理画面でカスタマイズされている可能性があるため更新しない）
        if (!existingPermission) {
          const permissionRecord = {
            group_name: groupDef.group_name,
            permissions: [...groupDef.permissions],
            description: groupDef.description,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
          
          await dynamodb.put(permissionsTableName, permissionRecord)
          logger.info(`グループ権限を作成しました: ${groupDef.group_name}`)
          syncedCount++
        }
        
      } catch (error) {
        logger.error(`グループ権限同期中にエラー (${groupDef.group_name}):`, error)
        errorsCount++
      }
    }
    
    logger.info(`グループ権限同期完了: ${syncedCount}件同期、${errorsCount}件エラー`)
    return { synced: syncedCount, errors: errorsCount }
    
  } catch (error) {
    logger.error('グループ権限同期エラー:', error)
    throw error
  }
}

/**
 * CognitoとPermissionsテーブル間でグループを双方向同期
 */
async function syncGroupsWithCognito(): Promise<{ synced: number; errors: number }> {
  const logger = useLogger({ prefix: '[GroupSync]' })
  
  try {
    const dynamodb = getDynamoDBService()
    const permissionsTableName = dynamodb.getTableName('permissions')
    
    let syncedCount = 0
    let errorsCount = 0
    
    // 1. Permissionsテーブルから全グループを取得
    logger.info('Permissionsテーブルからグループ一覧を取得中...')
    const permissionGroupsResult = await dynamodb.scan(permissionsTableName)
    const permissionGroups = permissionGroupsResult.items
    const permissionGroupNames = permissionGroups.map((item: any) => item.group_name as string)
    logger.info(`Permissionsテーブルに${permissionGroupNames.length}個のグループが見つかりました: ${permissionGroupNames.join(', ')}`)
    
    // 2. Cognitoから全グループを取得
    logger.info('Cognitoからグループ一覧を取得中...')
    const cognitoGroups = await listCognitoGroups()
    const cognitoGroupNames = cognitoGroups.map(group => group.GroupName)
    logger.info(`Cognitoに${cognitoGroupNames.length}個のグループが見つかりました: ${cognitoGroupNames.join(', ')}`)
    
    // 3. Permission側にあってCognito側にないグループ → Cognitoで作成
    const missingInCognito = permissionGroupNames.filter((name: string) => !cognitoGroupNames.includes(name))
    logger.info(`Cognitoに作成が必要なグループ: ${missingInCognito.length}個`)
    
    for (const groupName of missingInCognito) {
      try {
        const permissionGroup = permissionGroups.find((item: any) => item.group_name === groupName)
        const description = permissionGroup?.description || `${groupName}グループ (自動同期で作成)`
        
        await createCognitoGroup({
          groupName,
          description,
          precedence: groupName === 'administrator' ? 1 : 10
        })
        
        logger.info(`Cognitoにグループを作成しました: ${groupName}`)
        syncedCount++
      } catch (error: any) {
        if (error.name === 'GroupExistsException') {
          logger.info(`グループ${groupName}は既にCognitoに存在します`)
        } else {
          logger.error(`Cognitoグループ作成エラー (${groupName}):`, error)
          errorsCount++
        }
      }
    }
    
    // 4. Cognito側にあってPermission側にないグループ → 権限なしでレコード作成
    const missingInPermissions = cognitoGroupNames.filter(name => !permissionGroupNames.includes(name))
    logger.info(`Permissionsテーブルに作成が必要なグループ: ${missingInPermissions.length}個`)
    
    for (const groupName of missingInPermissions) {
      try {
        const cognitoGroup = cognitoGroups.find(group => group.GroupName === groupName)
        const description = cognitoGroup?.Description || `${groupName}グループ (Cognitoから同期)`
        
        const permissionRecord = {
          group_name: groupName,
          permissions: [], // 権限なしで作成
          description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        await dynamodb.put(permissionsTableName, permissionRecord)
        logger.info(`Permissionsテーブルにグループを作成しました: ${groupName} (権限なし)`)
        syncedCount++
      } catch (error) {
        logger.error(`Permissionsテーブルグループ作成エラー (${groupName}):`, error)
        errorsCount++
      }
    }
    
    logger.info(`グループ同期完了: ${syncedCount}件同期、${errorsCount}件エラー`)
    return { synced: syncedCount, errors: errorsCount }
    
  } catch (error) {
    logger.error('グループ同期エラー:', error)
    throw error
  }
}
