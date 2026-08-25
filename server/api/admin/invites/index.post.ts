import { createInvite } from '~/server/utils/invite-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminInvitesCreate]' })

  try {
    const currentUser = await requirePermission(event, 'invite:create')

    const invite = await createInvite(currentUser.user_id)

    return {
      success: true,
      data: invite,
      message: 'Invite created successfully'
    }
  } catch (error: unknown) {
    logger.error('招待コード発行エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create invite'
    })
  }
})
