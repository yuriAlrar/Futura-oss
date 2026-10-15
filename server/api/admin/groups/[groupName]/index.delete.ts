import { deleteCognitoGroup } from '~/server/utils/cognito-groups'
import { requireAdministrator } from '~/server/utils/auth'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import type { ApiResponse } from '~/types'

export default defineEventHandler(async (event): Promise<ApiResponse<void>> => {
  try {
    // administrator権限チェック
    await requireAdministrator(event)

    const groupName = getRouterParam(event, 'groupName')

    if (!groupName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Group name is required'
      })
    }

    // システムグループ（administrator、user）の削除を防ぐ
    if (groupName === 'administrator' || groupName === 'user') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot delete the system group: ${groupName}`
      })
    }

    await deleteCognitoGroup(groupName)

    // 権限レコードも削除する（残っていると同名グループを再作成した際に古い権限が復活するため）
    const dynamodb = getDynamoDBService()
    await dynamodb.delete(dynamodb.getTableName('permissions'), { group_name: groupName })

    return {
      success: true,
      message: 'Group deleted successfully'
    }
  } catch (error: any) {
    console.error(`Failed to delete group ${getRouterParam(event, 'groupName')}:`, error)

    // 認証/認可エラーはそのまま投げる
    if (error.statusCode === 401 || error.statusCode === 403) {
      throw error
    }

    // バリデーションエラーや404エラーもそのまま投げる
    if (error.statusCode === 400 || error.statusCode === 404) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete group'
    })
  }
})