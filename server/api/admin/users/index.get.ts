import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { User, PaginatedResponse, UserStats } from '~/types'

type DynamoDBValue = string | number | boolean | null | DynamoDBValue[] | { [key: string]: DynamoDBValue }
type DynamoDBRecord = Record<string, DynamoDBValue>

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminUsersGet]' })
  try {
    // 管理者権限が必要
    await requirePermission(event, 'user:read')

    const query = getQuery(event)
    const page = Number(query.page) || 1
    const limit = Math.min(Number(query.limit) || 20, 100)
    const status = query.status as string
    const search = query.search as string
    const profileApproved = query.profile_approved as string
    
    logger.debug('ユーザー取得リクエスト:', { page, limit, status, search, profileApproved })
    
    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('users')
    
    // フィルター式の構築
    let filterExpression = '#status <> :deleted'
    const expressionAttributeNames: Record<string, string> = { '#status': 'status' }
    const expressionAttributeValues: DynamoDBRecord = { ':deleted': 'deleted' }
    
    if (status && status !== 'all') {
      filterExpression += ' AND #status = :status'
      expressionAttributeValues[':status'] = status
    }

    // profile_approved による絞り込みはDynamoDB側では行わない。
    // 承認済み/未承認の件数を両方集計する必要があるため、取得後にメモリ上で絞り込む。
    
    // 検索機能のサポート
    if (search) {
      filterExpression += ' AND (contains(#name, :search) OR contains(#email, :search))'
      expressionAttributeNames['#name'] = 'name'
      expressionAttributeNames['#email'] = 'email'
      expressionAttributeValues[':search'] = search
    }

    // ユーザーテーブルのスキャン
    // 注意: DynamoDBのフィルタリングは、フィルターを適用する前にすべてのアイテムをスキャンします。
    // 小規模なデータセットの場合は問題ありませんが、大規模な場合はインデックスを使用すべきです。
    const result = await dynamodb.scan(tableName, {
      filterExpression,
      expressionAttributeNames,
      expressionAttributeValues,
      // フロントエンドで総数が必要なため、ここでは制限をかけない
    })

    const allUsers = (result.items as User[]).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // 統計値は profile_approved の絞り込み前の全件が対象（現在ページではない）
    const stats: UserStats = {
      totalCount: allUsers.length,
      profileApprovedCount: allUsers.filter(user => user.profile_approved).length,
      profilePendingCount: allUsers.filter(user => !user.profile_approved).length
    }

    // ここから先は一覧表示用の絞り込み
    let users = allUsers
    if (profileApproved === 'approved') {
      users = users.filter(user => user.profile_approved)
    } else if (profileApproved === 'pending') {
      users = users.filter(user => !user.profile_approved)
    }

    // ページネーションロジック
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedUsers = users.slice(startIndex, endIndex)

    const response: PaginatedResponse<User, UserStats> = {
      items: paginatedUsers,
      total: users.length,
      page,
      limit,
      hasMore: endIndex < users.length,
      stats
    }
    
    logger.info(`ユーザー取得完了: 総数${users.length}件, 返却${paginatedUsers.length}件 (page: ${page}, limit: ${limit})`)

    return {
      success: true,
      data: response
    }
  } catch (error: unknown) {
    logger.error('ユーザー取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch users'
    })
  }
})