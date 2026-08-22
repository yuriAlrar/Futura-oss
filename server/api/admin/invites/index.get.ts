import { listInvites } from '~/server/utils/invite-helpers'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminInvitesList]' })

  try {
    await requirePermission(event, 'invite:read')

    const items = await listInvites()

    return {
      success: true,
      data: { items }
    }
  } catch (error: unknown) {
    logger.error('招待コード一覧取得エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch invites'
    })
  }
})
