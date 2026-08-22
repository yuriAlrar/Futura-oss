import { getDynamoDBService } from '~/server/utils/dynamodb'
import { generateSegmentId } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'
import type { Segment, SegmentCreateForm, SegmentUpdateForm, SegmentWithMemberCount, User } from '~/types'

const logger = useLogger({ prefix: '[SegmentHelpers]' })

const segmentPk = (segmentId: string): string => `SEGMENT#${segmentId}`
const userSk = (userId: string): string => `USER#${userId}`

/**
 * セグメントを作成
 */
export async function createSegment(form: SegmentCreateForm, createdBy: string): Promise<Segment> {
  const dynamodb = getDynamoDBService()
  const segmentsTableName = dynamodb.getTableName('segments')

  const now = new Date().toISOString()
  const segment: Segment = {
    segment_id: generateSegmentId(),
    name: form.name,
    description: form.description,
    created_by: createdBy,
    created_at: now,
    updated_at: now
  }

  await dynamodb.put(segmentsTableName, segment as unknown as Record<string, unknown>)
  return segment
}

/**
 * セグメントを取得
 */
export async function getSegment(segmentId: string): Promise<Segment | null> {
  const dynamodb = getDynamoDBService()
  const segmentsTableName = dynamodb.getTableName('segments')

  const result = await dynamodb.get(segmentsTableName, { segment_id: segmentId })
  return (result as Segment) || null
}

/**
 * セグメント一覧を取得（所属ユーザー数を含む）
 */
export async function listSegments(): Promise<SegmentWithMemberCount[]> {
  const dynamodb = getDynamoDBService()
  const segmentsTableName = dynamodb.getTableName('segments')
  const userSegmentsTableName = dynamodb.getTableName('user_segments')

  const result = await dynamodb.scan(segmentsTableName)
  const segments = result.items as Segment[]

  const withCounts = await Promise.all(
    segments.map(async (segment) => {
      try {
        const membersResult = await dynamodb.query(
          userSegmentsTableName,
          'pk = :pk',
          { ':pk': segmentPk(segment.segment_id) }
        )
        return { ...segment, member_count: membersResult.items.length }
      } catch (error) {
        logger.warn(`セグメント ${segment.segment_id} のメンバー数取得に失敗:`, error)
        return { ...segment, member_count: 0 }
      }
    })
  )

  return withCounts
}

/**
 * セグメントを更新
 */
export async function updateSegment(segmentId: string, form: SegmentUpdateForm): Promise<Segment> {
  const dynamodb = getDynamoDBService()
  const segmentsTableName = dynamodb.getTableName('segments')

  const updateExpressions: string[] = ['#updated_at = :updated_at']
  const expressionAttributeNames: Record<string, string> = { '#updated_at': 'updated_at' }
  const expressionAttributeValues: Record<string, unknown> = { ':updated_at': new Date().toISOString() }

  if (form.name !== undefined) {
    updateExpressions.push('#name = :name')
    expressionAttributeNames['#name'] = 'name'
    expressionAttributeValues[':name'] = form.name
  }

  if (form.description !== undefined) {
    updateExpressions.push('#description = :description')
    expressionAttributeNames['#description'] = 'description'
    expressionAttributeValues[':description'] = form.description
  }

  const updated = await dynamodb.update(
    segmentsTableName,
    { segment_id: segmentId },
    `SET ${updateExpressions.join(', ')}`,
    expressionAttributeValues as any,
    expressionAttributeNames
  )

  return updated as unknown as Segment
}

/**
 * セグメントを削除（所属メンバーの紐付けレコードも合わせて削除する）
 */
export async function deleteSegment(segmentId: string): Promise<void> {
  const dynamodb = getDynamoDBService()
  const segmentsTableName = dynamodb.getTableName('segments')
  const userSegmentsTableName = dynamodb.getTableName('user_segments')

  const membersResult = await dynamodb.query(
    userSegmentsTableName,
    'pk = :pk',
    { ':pk': segmentPk(segmentId) }
  )

  for (const membership of membersResult.items) {
    await dynamodb.delete(userSegmentsTableName, { pk: membership.pk, sk: membership.sk })
  }

  await dynamodb.delete(segmentsTableName, { segment_id: segmentId })
}

/**
 * ユーザーをセグメントに追加
 */
export async function addUserToSegment(segmentId: string, userId: string): Promise<void> {
  const dynamodb = getDynamoDBService()
  const userSegmentsTableName = dynamodb.getTableName('user_segments')

  await dynamodb.put(userSegmentsTableName, {
    pk: segmentPk(segmentId),
    sk: userSk(userId),
    joined_at: new Date().toISOString()
  })
}

/**
 * ユーザーをセグメントから除外
 */
export async function removeUserFromSegment(segmentId: string, userId: string): Promise<void> {
  const dynamodb = getDynamoDBService()
  const userSegmentsTableName = dynamodb.getTableName('user_segments')

  await dynamodb.delete(userSegmentsTableName, {
    pk: segmentPk(segmentId),
    sk: userSk(userId)
  })
}

/**
 * セグメントに所属するユーザー一覧を取得（ユーザー詳細情報付き）
 */
export async function getUsersInSegment(segmentId: string): Promise<User[]> {
  const dynamodb = getDynamoDBService()
  const userSegmentsTableName = dynamodb.getTableName('user_segments')
  const usersTableName = dynamodb.getTableName('users')

  const membersResult = await dynamodb.query(
    userSegmentsTableName,
    'pk = :pk',
    { ':pk': segmentPk(segmentId) }
  )

  const users: User[] = []
  for (const membership of membersResult.items) {
    const userId = String(membership.sk).replace('USER#', '')
    try {
      const user = await dynamodb.get(usersTableName, { user_id: userId })
      if (user) {
        users.push(user as User)
      }
    } catch (error) {
      logger.warn(`セグメントメンバー ${userId} のユーザー情報取得に失敗:`, error)
    }
  }

  return users
}

/**
 * ユーザーが所属するセグメントID一覧を取得（GSI一発）
 */
export async function getSegmentIdsForUser(userId: string): Promise<string[]> {
  const dynamodb = getDynamoDBService()
  const userSegmentsTableName = dynamodb.getTableName('user_segments')

  const result = await dynamodb.query(
    userSegmentsTableName,
    'sk = :sk',
    { ':sk': userSk(userId) },
    { indexName: 'UserSegmentIndex' }
  )

  return result.items.map(item => String(item.pk).replace('SEGMENT#', ''))
}

/**
 * 一括操作の対象ユーザーを取得
 * - segmentIdが指定された場合: そのセグメントに所属するアクティブユーザー（複数セグメント指定時は重複除去）
 * - segmentIdが未指定の場合: 全アクティブユーザー（既存挙動）
 * いずれの場合も運用停止ステート（operation_status === 'suspended'）のユーザーは除外する
 */
export async function getBatchTargetUsers(segmentId?: string): Promise<User[]> {
  const dynamodb = getDynamoDBService()
  const usersTableName = dynamodb.getTableName('users')

  let candidates: User[]

  if (segmentId) {
    candidates = await getUsersInSegment(segmentId)
    // status='active'のユーザーのみに絞り込む（既存の一括操作の前提を踏襲）
    candidates = candidates.filter(u => u.status === 'active')
  } else {
    const result = await dynamodb.scan(usersTableName, {
      filterExpression: '#status = :active',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: { ':active': 'active' }
    })
    candidates = result.items as User[]
  }

  // 運用停止ステートのユーザーを一括操作の対象から除外
  return candidates.filter(u => u.operation_status !== 'suspended')
}
