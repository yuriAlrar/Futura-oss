import { getInvite } from '~/server/utils/invite-helpers'
import { checkRateLimit } from '~/server/utils/rate-limiter'
import { useLogger } from '~/composables/useLogger'
import { INVITE_STATUS } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[PublicInviteCheck]' })

  try {
    const clientIp = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
    if (!checkRateLimit(`invite-check:${clientIp}`, 30, 60 * 1000)) {
      throw createError({ statusCode: 429, statusMessage: 'Too many requests' })
    }

    const code = getRouterParam(event, 'code')
    if (!code) {
      throw createError({ statusCode: 400, statusMessage: 'Invite code is required' })
    }

    const invite = await getInvite(code)
    const valid = !!invite && invite.status === INVITE_STATUS.ACTIVE

    return {
      success: true,
      data: { valid }
    }
  } catch (error: unknown) {
    logger.error('招待コード確認エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to check invite'
    })
  }
})
