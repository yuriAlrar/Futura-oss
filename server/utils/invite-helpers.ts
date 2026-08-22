import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { generateInviteCode } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'
import type { Invite } from '~/types'
import { INVITE_STATUS } from '~/types'

const logger = useLogger({ prefix: '[InviteHelpers]' })

/**
 * 招待コードを発行
 */
export async function createInvite(createdBy: string): Promise<Invite> {
  const dynamodb = getDynamoDBService()
  const invitesTableName = dynamodb.getTableName('invites')

  const invite: Invite = {
    invite_code: generateInviteCode(),
    status: INVITE_STATUS.ACTIVE,
    created_by: createdBy,
    created_at: new Date().toISOString()
  }

  await dynamodb.put(invitesTableName, invite as unknown as Record<string, unknown>)
  return invite
}

/**
 * 招待コードを取得
 */
export async function getInvite(inviteCode: string): Promise<Invite | null> {
  const dynamodb = getDynamoDBService()
  const invitesTableName = dynamodb.getTableName('invites')

  const result = await dynamodb.get(invitesTableName, { invite_code: inviteCode })
  return (result as Invite) || null
}

/**
 * 招待コード一覧を取得
 */
export async function listInvites(): Promise<Invite[]> {
  const dynamodb = getDynamoDBService()
  const invitesTableName = dynamodb.getTableName('invites')

  const result = await dynamodb.scan(invitesTableName)
  return (result.items as Invite[]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/**
 * 招待コードを失効させる
 */
export async function revokeInvite(inviteCode: string): Promise<void> {
  const dynamodb = getDynamoDBService()
  const invitesTableName = dynamodb.getTableName('invites')

  await dynamodb.update(
    invitesTableName,
    { invite_code: inviteCode },
    'SET #status = :revoked, revoked_at = :revoked_at',
    { ':revoked': INVITE_STATUS.REVOKED, ':revoked_at': new Date().toISOString() },
    { '#status': 'status' }
  )
}

/**
 * 招待コードを使用済みにする（同時使用による二重登録を防ぐため、status='active'であることを条件付きで更新する）
 * @returns 更新に成功した場合true、既に使用済み/失効済みで競合した場合false
 */
export async function consumeInvite(inviteCode: string, userId: string): Promise<boolean> {
  const dynamodb = getDynamoDBService()
  const invitesTableName = dynamodb.getTableName('invites')

  try {
    await dynamodb.update(
      invitesTableName,
      { invite_code: inviteCode },
      'SET #status = :consumed, consumed_by = :consumed_by, consumed_at = :consumed_at',
      {
        ':consumed': INVITE_STATUS.CONSUMED,
        ':consumed_by': userId,
        ':consumed_at': new Date().toISOString(),
        ':active': INVITE_STATUS.ACTIVE
      },
      { '#status': 'status' },
      '#status = :active'
    )
    return true
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      logger.warn(`招待コード ${inviteCode} は既に使用済み/失効済みです`)
      return false
    }
    throw error
  }
}
