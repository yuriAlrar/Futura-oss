import type { Transaction } from '~/types'
import { isApprovedTransaction } from '~/server/utils/transaction-helpers'

const BTC_PRECISION = 100000000 // BTCの小数点8桁分の乗数（浮動小数の丸め誤差防止用）

/**
 * 集計の基準タイムゾーン。
 * 「今日の入金総額」などの日付境界は、サーバの実行環境（Lambdaは通常UTC）ではなく
 * 利用者のタイムゾーンで判定する必要があるため固定する。
 */
const STATS_TIME_ZONE = 'Asia/Tokyo'

const statsDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: STATS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

/**
 * 日時を集計基準タイムゾーンでの `YYYY-MM-DD` 文字列に変換する
 */
export function toStatsDateString(value: string | Date | undefined | null): string | null {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return null

  return statsDateFormatter.format(date)
}

/**
 * 集計基準タイムゾーンでの本日の日付（`YYYY-MM-DD`）を返す
 */
export function todayStatsDateString(): string {
  return statsDateFormatter.format(new Date())
}

/**
 * 複数のBTC金額を、浮動小数点の丸め誤差を出さずに合計する
 * （例: 0.1 + 0.2 が 0.30000000000000004 になるのを防ぐ）
 */
export function sumBtc(amounts: number[]): number {
  const sumInt = amounts.reduce((acc, value) => acc + Math.round(value * BTC_PRECISION), 0)
  return sumInt / BTC_PRECISION
}

/**
 * 取引種別ごとにBTC金額を合計する。種別を省略した場合は全件の合計。
 * 出金は負の値で保存されているため、合計も負の値で返る。
 */
export function sumTransactionsBtc(transactions: Transaction[], transactionType?: string): number {
  const targets = transactionType
    ? transactions.filter(t => t.transaction_type === transactionType)
    : transactions

  return sumBtc(targets.map(t => t.amount))
}

/**
 * 各取引時点での残高（running balance）を transaction_id ごとに算出する。
 *
 * 残高推移は「その取引までの累積」なので、必ずページングや絞り込みをする前の
 * 全取引を渡すこと。1ページ分だけで計算すると累積の起点がずれる。
 */
export function buildRunningBalanceMap(transactions: Transaction[]): Map<string, number> {
  // 時系列の昇順（古い順）に並べ替えてから累積する
  const ascending = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const balanceMap = new Map<string, number>()
  let runningTotalInt = 0

  for (const transaction of ascending) {
    // 承認済み取引のみ残高に反映する（承認待ち・拒否済みは残高を動かさない）
    if (isApprovedTransaction(transaction)) {
      runningTotalInt += Math.round(transaction.amount * BTC_PRECISION)
    }
    balanceMap.set(transaction.transaction_id, runningTotalInt / BTC_PRECISION)
  }

  return balanceMap
}
