/**
 * シンプルなインメモリ・レートリミッター
 *
 * 注意: Lambda実行環境ではインスタンスごとにメモリが独立しているため、
 * 複数インスタンスにまたがる完全なレート制限にはならない（ベストエフォート）。
 * 未認証で叩ける公開エンドポイント（招待制登録等）の濫用を軽減する目的の最低限の対策であり、
 * 本番運用ではAWS WAF等のインフラ層での対策と併用することを推奨する。
 */

const requestLog = new Map<string, number[]>()

/**
 * 指定キー（通常はIPアドレス）が制限時間内に許容回数を超えていないかチェックする
 * @returns true = リクエスト許可, false = レート制限超過
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const timestamps = (requestLog.get(key) || []).filter(t => now - t < windowMs)

  if (timestamps.length >= maxRequests) {
    requestLog.set(key, timestamps)
    return false
  }

  timestamps.push(now)
  requestLog.set(key, timestamps)
  return true
}
