import crypto from 'node:crypto'

/**
 * UUID生成ユーティリティ
 * Node.js環境専用のUUID生成機能を提供
 */

/**
 * ランダムなUUIDv4を生成
 * @returns {string} UUID文字列 (例: "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * セッションID用のUUID生成
 * セッション管理で使用するためのエイリアス
 * @returns {string} UUID文字列
 */
export function generateSessionId(): string {
  return generateUUID()
}

/**
 * 取引ID用のUUID生成  
 * トランザクション管理で使用するためのエイリアス
 * @returns {string} UUID文字列
 */
export function generateTransactionId(): string {
  return generateUUID()
}

/**
 * 汎用ID生成
 * リクエストID、ジョブIDなど汎用的な用途向け
 * @returns {string} UUID文字列
 */
export function generateId(): string {
  return generateUUID()
}

/**
 * セグメントID用のUUID生成
 * @returns {string} UUID文字列
 */
export function generateSegmentId(): string {
  return generateUUID()
}

/**
 * 招待コード生成
 * アカウント作成権限を持つ使い切りトークンのため、推測困難な高エントロピー文字列を生成する
 * @returns {string} URL-safeなランダム文字列（約32文字）
 */
export function generateInviteCode(): string {
  return crypto.randomBytes(24).toString('base64url')
}

/**
 * Cognitoパスワードポリシー（8文字以上、小文字・数字必須）を満たす仮パスワードを生成
 * @returns {string} ランダムな仮パスワード
 */
export function generateTemporaryPassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const all = lower + digits + lower.toUpperCase()

  const randomChar = (charset: string) => charset[crypto.randomInt(charset.length)]

  // ポリシーを確実に満たすため、小文字・数字を先頭に固定してから残りをランダム化
  const required = [randomChar(lower), randomChar(digits)]
  const rest = Array.from({ length: 10 }, () => randomChar(all))

  return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('')
}