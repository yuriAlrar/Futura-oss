import { getRequiredPermissions } from '~/server/utils/permission-matcher'
import { requireAuth } from '~/server/utils/auth'
import { validatePermissions } from '~/server/utils/permission-definitions'
import { useLogger } from '~/composables/useLogger'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[PermissionMiddleware]' })
  const path = getRequestURL(event).pathname
  const method = getMethod(event)
  
  // API以外はスキップ
  if (!path.startsWith('/api/')) {
    return
  }
  
  // 認証API（login, logout等）はスキップ
  if (path.startsWith('/api/auth/')) {
    return
  }

  // 未認証で利用する公開API（招待コード確認・新規登録等）はスキップ
  // ※ これらのエンドポイント自体が招待コードの検証等で保護される
  if (path.startsWith('/api/public/')) {
    return
  }
  
  logger.debug(`権限チェック開始: ${method} ${path}`)
  
  try {
    const permissionConfig = getRequiredPermissions(path, method)
    
    if (!permissionConfig) {
      logger.warn(`権限設定が見つかりません: ${method} ${path}`)
      // 設定なしの場合は認証のみ要求（安全側に倒す）
      await requireAuth(event)
      return
    }
    
    // 認証のみの場合
    if (permissionConfig.authOnly) {
      logger.debug('認証のみチェック')
      await requireAuth(event)
      return
    }
    
    // 権限チェック
    if (permissionConfig.permissions && permissionConfig.permissions.length > 0) {
      logger.debug(`権限チェック: ${permissionConfig.permissions.join(', ')}`)
      
      const user = await requireAuth(event)
      
      // 権限バリデーション
      const { valid, invalid } = validatePermissions(permissionConfig.permissions)
      if (invalid.length > 0) {
        logger.error(`無効な権限が指定されています: ${invalid.join(', ')}`)
        throw createError({
          statusCode: 500,
          statusMessage: `Invalid permissions specified: ${invalid.join(', ')}`
        })
      }
      
      // 権限チェック
      const hasPermissions = permissionConfig.permissions.map(permission => 
        user.permissions.includes(permission)
      )
      
      const operator = permissionConfig.operator || 'AND'
      const isAuthorized = operator === 'OR'
        ? hasPermissions.some(Boolean)
        : hasPermissions.every(Boolean)
      
      if (!isAuthorized) {
        logger.warn(`権限不足: ${user.email}, 必要権限: ${permissionConfig.permissions.join(` ${operator} `)}`)
        throw createError({
          statusCode: 403,
          statusMessage: `Insufficient permissions. Required: ${permissionConfig.permissions.join(` ${operator} `)}`
        })
      }
      
      logger.debug(`権限チェック成功: ${user.email}`)
    }
    
  } catch (error) {
    logger.error(`権限チェックエラー: ${method} ${path}`, error)
    throw error
  }
})