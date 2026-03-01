import type { Transaction } from '~/types'

/**
 * トランザクションタイプに応じたラベルを返す
 */
export function getTransactionTypeLabel(transactionType: Transaction['transaction_type']): string {
  switch (transactionType) {
    case 'deposit':
      return '入金'
    case 'withdrawal':
      return '出金'
    case 'asset_management':
      return '資産運用'
    default:
      return transactionType
  }
}

/**
 * トランザクションタイプに応じた色を返す
 */
export function getTransactionTypeColor(transactionType: Transaction['transaction_type']): string {
  switch (transactionType) {
    case 'deposit':
      return 'success'
    case 'withdrawal':
      return 'error'
    case 'asset_management':
      return 'info'
    default:
      return 'grey'
  }
}

/**
 * トランザクションタイプに応じたアイコン名を返す
 */
export function getTransactionTypeIcon(transactionType: Transaction['transaction_type']): string {
  switch (transactionType) {
    case 'deposit':
      return 'mdi:plus'
    case 'withdrawal':
      return 'mdi:minus'
    case 'asset_management':
      return 'mdi:chart-line'
    default:
      return 'mdi:help-circle'
  }
}

/**
 * トランザクションタイプに応じたCSS色クラスを返す
 */
export function getTransactionTypeTextColor(transactionType: Transaction['transaction_type']): string {
  switch (transactionType) {
    case 'deposit':
      return 'text-green-600'
    case 'withdrawal':
      return 'text-red-600'
    case 'asset_management':
      return 'text-blue-600'
    default:
      return 'text-gray-600'
  }
}

/**
 * トランザクションタイプに応じた符号を返す
 */
export function getTransactionTypeSign(transactionType: Transaction['transaction_type'], amount?: number): string {
  switch (transactionType) {
    case 'deposit':
      return '+'
    case 'withdrawal':
      return '-'
    case 'asset_management':
      return amount && amount >= 0 ? '+' : '-'
    default:
      return amount && amount >= 0 ? '+' : '-'
  }
}

/**
 * トランザクションタイプに応じたVuetify色名を返す（テーブル用）
 */
export function getTransactionTypeVuetifyColor(transactionType: Transaction['transaction_type']): string {
  switch (transactionType) {
    case 'deposit':
      return 'orange'
    case 'withdrawal':
      return 'deep-orange'
    case 'asset_management':
      return 'blue-grey'
    default:
      return 'grey'
  }
}

// ----------------------------------------------------------------------------
// 計算・判定ユーティリティ
// ----------------------------------------------------------------------------

const BTC_PRECISION = 100000000 // 特別に定義するBTCの小数点8桁分の乗数（浮動小数計算エラー防止用）

/**
 * 複数の数値（BTC）の合計を、浮動小数点の丸め誤差を出さずに正確に計算する
 * （例: 0.1 + 0.2 などで 0.300000000000004 になるのを防ぐ）
 */
export function calculateBtcSum(amounts: number[]): number {
  const sumInt = amounts.reduce((acc, val) => acc + Math.round(val * BTC_PRECISION), 0)
  console.log(sumInt, sumInt / BTC_PRECISION)
  return sumInt / BTC_PRECISION
}

/**
 * トランザクションが承認済み（または以前のバージョンによるステータス未定義）か判定する
 */
// バックエンドのTransaction型に近い形で判定
export function isApprovedTransaction(transaction: { status?: string }): boolean {
  return !transaction.status || transaction.status === 'approved'
}

/**
 * トランザクション配列から、出金などの種別ごとに金額（amount）だけを抽出し、正確に加算する
 *
 * target_type に 'deposit', 'withdrawal' 等を指定するか、指定なしで全合計を出す
 */
export function reduceTransactionsBtc(transactions: any[], targetType?: string): number {
  const filtered = targetType
    ? transactions.filter(t => t.transaction_type === targetType)
    : transactions

  const amounts = filtered.map(t => t.amount)
  return calculateBtcSum(amounts)
}
