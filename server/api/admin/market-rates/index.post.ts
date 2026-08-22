export default defineEventHandler(async (event) => {
  // Require admin permission (作成権限を持つ管理者のみ、無効化されている旨を伝える)
  await requirePermission(event, 'market_rate:create')

  // 相場レート機能は1BTC=1JPY固定運用のため、レートの新規作成操作を無効化している
  // （DBスキーマ・APIエンドポイント自体は将来のレート変動再開に備えて維持する）
  throw createError({
    statusCode: 403,
    statusMessage: 'Market rate operations are currently disabled (fixed at 1 BTC = 1 JPY)'
  })
})
