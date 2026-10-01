// 1. 外部ライブラリ
import {
  AdminListGroupsForUserCommand,
  ListGroupsCommand,
  CreateGroupCommand,
  GetGroupCommand,
  UpdateGroupCommand,
  DeleteGroupCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminGetUserCommand,
  ListUsersInGroupCommand,
  type AdminListGroupsForUserCommandOutput,
  type ListGroupsCommandOutput,
  type ListUsersInGroupCommandOutput,
  UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider'

// 2. 内部server utils
import { createCognitoClient } from './client-factory'
import { getDynamoDBService } from './dynamodb'

// 3. 内部composables（ユニバーサル）
import { useLogger } from '~/composables/useLogger'

// 4. Types
import type { CognitoGroup, GroupCreateForm, GroupUpdateForm, UserGroupMembership, User } from '~/types'

// Server-side logger (useLogger composable使用)
const logger = useLogger({ prefix: '[COGNITO-GROUPS]' })

/**
 * ユーザーが所属するCognitoグループを取得
 */
export const getCognitoGroups = async (username: string): Promise<string[]> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    // 所属グループが1ページに収まらない場合に備え、NextTokenがなくなるまで取得する
    const groupNames: string[] = []
    let nextToken: string | undefined = undefined

    do {
      const command: AdminListGroupsForUserCommand = new AdminListGroupsForUserCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        Username: username,
        NextToken: nextToken
      })

      const response = await client.send(command) as AdminListGroupsForUserCommandOutput
      groupNames.push(...(response.Groups?.map(group => group.GroupName || '') || []))
      nextToken = response.NextToken
    } while (nextToken)

    return groupNames
  } catch (error) {
    logger.error(`ユーザー${username}のグループ取得に失敗しました:`, error)
    return []
  }
}

/**
 * 全てのCognitoグループを取得
 */
export const listCognitoGroups = async (): Promise<CognitoGroup[]> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    // 全てのグループをページネーションを使用して取得
    let allGroups: any[] = []
    let nextToken: string | undefined = undefined
    
    do {
      const command = new ListGroupsCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        NextToken: nextToken
      })
      
      const response = await client.send(command) as ListGroupsCommandOutput
      if (response.Groups) {
        allGroups = [...allGroups, ...response.Groups]
      }
      nextToken = response.NextToken
    } while (nextToken)
    
    return allGroups.map(group => ({
      GroupName: group.GroupName || '',
      UserPoolId: config.cognitoUserPoolId as string,
      Description: group.Description,
      RoleArn: group.RoleArn,
      Precedence: group.Precedence,
      LastModifiedDate: group.LastModifiedDate,
      CreationDate: group.CreationDate
    })) || []
  } catch (error) {
    logger.error('グループ一覧の取得に失敗しました:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list groups'
    })
  }
}

/**
 * Cognitoグループを作成
 */
export const createCognitoGroup = async (groupData: GroupCreateForm): Promise<CognitoGroup> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new CreateGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      GroupName: groupData.groupName,
      Description: groupData.description,
      Precedence: groupData.precedence
    })
    
    const response = await client.send(command)
    
    if (!response.Group) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create group'
      })
    }
    
    return {
      GroupName: response.Group.GroupName || '',
      UserPoolId: config.cognitoUserPoolId as string,
      Description: response.Group.Description,
      RoleArn: response.Group.RoleArn,
      Precedence: response.Group.Precedence,
      LastModifiedDate: response.Group.LastModifiedDate,
      CreationDate: response.Group.CreationDate
    }
  } catch (error: any) {
    logger.error('グループ作成に失敗しました:', error)
    if (error.name === 'GroupExistsException') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Group already exists'
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create group'
    })
  }
}

/**
 * Cognitoグループを取得
 */
export const getCognitoGroup = async (groupName: string): Promise<CognitoGroup | null> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new GetGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      GroupName: groupName
    })
    
    const response = await client.send(command)
    
    if (!response.Group) {
      return null
    }
    
    return {
      GroupName: response.Group.GroupName || '',
      UserPoolId: config.cognitoUserPoolId as string,
      Description: response.Group.Description,
      RoleArn: response.Group.RoleArn,
      Precedence: response.Group.Precedence,
      LastModifiedDate: response.Group.LastModifiedDate,
      CreationDate: response.Group.CreationDate
    }
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return null
    }
    logger.error(`グループ${groupName}の取得に失敗しました:`, error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to get group'
    })
  }
}

/**
 * Cognitoグループを更新
 */
export const updateCognitoGroup = async (groupName: string, groupData: GroupUpdateForm): Promise<CognitoGroup> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new UpdateGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      GroupName: groupName,
      Description: groupData.description,
      Precedence: groupData.precedence
    })
    
    const response = await client.send(command)
    
    if (!response.Group) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update group'
      })
    }
    
    return {
      GroupName: response.Group.GroupName || '',
      UserPoolId: config.cognitoUserPoolId as string,
      Description: response.Group.Description,
      RoleArn: response.Group.RoleArn,
      Precedence: response.Group.Precedence,
      LastModifiedDate: response.Group.LastModifiedDate,
      CreationDate: response.Group.CreationDate
    }
  } catch (error: any) {
    logger.error(`グループ${groupName}の更新に失敗しました:`, error)
    if (error.name === 'ResourceNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Group not found'
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update group'
    })
  }
}

/**
 * Cognitoグループを削除
 */
export const deleteCognitoGroup = async (groupName: string): Promise<void> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new DeleteGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      GroupName: groupName
    })
    
    await client.send(command)
  } catch (error: any) {
    logger.error(`グループ${groupName}の削除に失敗しました:`, error)
    if (error.name === 'ResourceNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Group not found'
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete group'
    })
  }
}

/**
 * ユーザーをグループに追加
 */
export const addUserToGroup = async (username: string, groupName: string): Promise<void> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    // ユーザーの存在確認
    await verifyUserExists(username)
    
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: username,
      GroupName: groupName
    })
    
    await client.send(command)
  } catch (error: any) {
    logger.error(`ユーザー${username}をグループ${groupName}に追加することに失敗しました:`, error)
    if (error.name === 'UserNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }
    if (error.name === 'ResourceNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Group not found'
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add user to group'
    })
  }
}

/**
 * ユーザーをグループから削除
 */
export const removeUserFromGroup = async (username: string, groupName: string): Promise<void> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new AdminRemoveUserFromGroupCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: username,
      GroupName: groupName
    })
    
    await client.send(command)
  } catch (error: any) {
    logger.error(`ユーザー${username}をグループ${groupName}から削除することに失敗しました:`, error)
    if (error.name === 'UserNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }
    if (error.name === 'ResourceNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Group not found'
      })
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove user from group'
    })
  }
}

/**
 * ユーザーの存在確認
 */
export const verifyUserExists = async (username: string): Promise<void> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    const command = new AdminGetUserCommand({
      UserPoolId: config.cognitoUserPoolId as string,
      Username: username
    })
    
    await client.send(command)
  } catch (error: any) {
    if (error instanceof UserNotFoundException || error.name === 'UserNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }
    throw error
  }
}

/**
 * グループに所属するユーザー一覧を取得
 */
export const listUsersInGroup = async (groupName: string): Promise<User[]> => {
  try {
    const config = useRuntimeConfig()
    const client = createCognitoClient()
    
    // グループ内の全ユーザーをページネーションを使用して取得
    let allCognitoUsers: any[] = []
    let nextToken: string | undefined = undefined
    
    do {
      const command = new ListUsersInGroupCommand({
        UserPoolId: config.cognitoUserPoolId as string,
        GroupName: groupName,
        NextToken: nextToken
      })
      
      const response = await client.send(command) as ListUsersInGroupCommandOutput
      if (response.Users) {
        allCognitoUsers = [...allCognitoUsers, ...response.Users]
      }
      nextToken = response.NextToken
    } while (nextToken)
    
    if (allCognitoUsers.length === 0) {
      return []
    }
    
    // DynamoDBからユーザー詳細を取得
    const dynamodb = getDynamoDBService()
    const usersTableName = dynamodb.getTableName('users')
    
    const users: User[] = []
    
    for (const cognitoUser of allCognitoUsers) {
      try {
        // Get user ID (sub) from Cognito attributes
        const subAttribute = cognitoUser.Attributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === 'sub')
        if (!subAttribute?.Value) continue
        
        // Get user details from DynamoDB
        const user = await dynamodb.get(usersTableName, { user_id: subAttribute.Value }) as User | null
        
        if (user) {
          users.push(user)
        }
      } catch (error) {
        logger.warn(`Cognitoユーザーの詳細取得に失敗しました:`, error)
        // Continue with other users even if one fails
      }
    }
    
    return users
  } catch (error: any) {
    logger.error(`グループ${groupName}のユーザー一覧取得に失敗しました:`, error)
    
    if (error.name === 'ResourceNotFoundException') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Group not found'
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to list users in group'
    })
  }
}

/**
 * ユーザーがadministratorグループに所属しているかチェック
 */
export const isUserAdministrator = async (username: string): Promise<boolean> => {
  const groups = await getCognitoGroups(username)
  return groups.includes('administrator')
}