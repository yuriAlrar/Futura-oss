import { getInvite, revokeInvite } from '~/server/utils/invite-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminInviteRevoke]' })

  try {
    await requirePermission(event, 'invite:revoke')

    const inviteCode = getRouterParam(event, 'inviteCode')
    if (!inviteCode) {
      throw createError({ statusCode: 400, statusMessage: 'Invite code is required' })
    }

    const invite = await getInvite(inviteCode)
    if (!invite) {
      throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
    }

    await revokeInvite(inviteCode)

    return {
      success: true,
      message: 'Invite revoked successfully'
    }
  } catch (error: unknown) {
    logger.error('招待コード失効エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to revoke invite'
    })
  }
})
