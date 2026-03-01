import type { Transaction } from '~/types'
import { TRANSACTION_STATUS } from '~/types'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { createError } from 'h3'

/**
 * 取引が承認済みかどうかを判定
 * statusが未設定の場合は承認済みとして扱う（下位互換性）
 */
export function isApprovedTransaction(transaction: Transaction): boolean {
  return !transaction.status || transaction.status === TRANSACTION_STATUS.APPROVED
}

/**
 * 承認済み取引のみを抽出
 */
export function filterApprovedTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter(isApprovedTransaction)
}

/**
 * 取引リストから残高を計算
 * 承認済み取引のみを対象とする
 */
export function calculateBalance(transactions: Transaction[]): number {
  return filterApprovedTransactions(transactions).reduce((balance, transaction) => {
    if (transaction.transaction_type === 'deposit') {
      return balance + transaction.amount
    } else if (transaction.transaction_type === 'withdrawal') {
      // 出金の場合はDBに負の値として保存されているため、そのまま加算する（例: balance + (-1000)）
      return balance + transaction.amount
    } else if (transaction.transaction_type === 'asset_management') {
      // 資産運用: amountが正負の値を持つのでそのまま加算
      return balance + transaction.amount
    }
    return balance
  }, 0)
}

/**
 * 指定日時以前の取引をフィルター
 */
export function filterTransactionsByDate(
  transactions: Transaction[], 
  endDate: Date
): Transaction[] {
  return transactions.filter(t => new Date(t.timestamp) <= endDate)
}

/**
 * 指定日時以前の承認済み取引から残高を計算
 */
export function calculateBalanceAtDate(
  transactions: Transaction[], 
  endDate: Date
): number {
  const relevantTransactions = filterTransactionsByDate(transactions, endDate)
  return calculateBalance(relevantTransactions)
}

/**
 * ユーザーの現在の残高を取得
 * 承認済み取引のみを対象とする
 */
export async function getTotalBalance(userId: string): Promise<number> {
  const dynamodb = getDynamoDBService()
  const transactionsTableName = dynamodb.getTableName('transactions')

  try {
    const result = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { ':user_id': userId },
      {
        indexName: 'UserTimestampIndex'
      }
    )

    const transactions = result.items as Transaction[]

    // 承認済み取引のみを対象とする（statusが未設定の場合は承認済みとして扱う）
    return calculateBalance(transactions)
  } catch (error: unknown) {
    console.error('[TransactionHelpers-Balance] 残高計算に失敗:', error)
    return 0
  }
}

// ============================================================================
// ダッシュボード統計計算関数群
// ============================================================================

/**
 * 入金元本を計算
 * 承認済み入金取引のみを対象とする
 */
export function calculateDepositPrincipal(transactions: Transaction[]): number {
  return filterApprovedTransactions(transactions)
    .filter(t => t.transaction_type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)
}

/**
 * 出金額を計算（絶対値で返す）
 * 承認済み出金取引のみを対象とする
 */
export function calculateWithdrawalTotal(transactions: Transaction[]): number {
  return Math.abs(
    filterApprovedTransactions(transactions)
      .filter(t => t.transaction_type === 'withdrawal')
      .reduce((sum, t) => sum + t.amount, 0)
  )
}

/**
 * クレジットボーナスを計算
 * 承認済み入金取引でreasonが「クレジットボーナス」のもののみを対象とする
 */
export function calculateCreditBonus(transactions: Transaction[]): number {
  return filterApprovedTransactions(transactions)
    .filter(t => t.transaction_type === 'deposit' && t.reason === 'クレジットボーナス')
    .reduce((sum, t) => sum + t.amount, 0)
}

/**
 * 純利益を計算
 * 純利益 = 現在残高 - 入金元本 + 出金額
 * 資産運用による増減も含まれる（現在残高に含まれているため）
 */
export function calculateNetProfit(
  currentBalance: number,
  depositPrincipal: number,
  withdrawalTotal: number
): number {
  return currentBalance - depositPrincipal + withdrawalTotal
}

// ============================================================================
// 取引バリデーション関数群
// ============================================================================

/**
 * 取引バリデーション用の共通インターフェース
 */
export interface TransactionValidationData {
  amount: number
  transaction_type: string
  reason?: string
  user_id?: string
}

/**
 * 取引の基本バリデーション（必須フィールド、transaction_type、amountの整合性）
 */
export function validateTransactionBasic(data: TransactionValidationData): void {
  // 必須フィールドのチェック
  if (!data.amount || !data.transaction_type) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Amount and transaction_type are required'
    })
  }

  // transaction_typeの有効性チェック
  if (!['deposit', 'withdrawal'].includes(data.transaction_type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid transaction_type. Must be deposit or withdrawal'
    })
  }

  // transaction_typeに応じたamountのバリデーション
  if (data.transaction_type === 'deposit') {
    // 入金の場合は正の値である必要がある
    if (data.amount <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Amount must be greater than 0 for deposit transactions'
      })
    }
  } else if (data.transaction_type === 'withdrawal') {
    // 出金の場合は負の値である必要がある
    if (data.amount >= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Amount must be negative for withdrawal transactions'
      })
    }
  }
}

/**
 * 取引リクエスト用のバリデーション（reasonも必須）
 */
export function validateTransactionRequest(data: TransactionValidationData): void {
  // 基本バリデーション
  validateTransactionBasic(data)

  // reasonの必須チェック
  if (!data.reason) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reason is required for transaction requests'
    })
  }
}

/**
 * 管理者取引作成用のバリデーション（user_idも必須）
 */
export function validateAdminTransaction(data: TransactionValidationData): void {
  // 基本バリデーション
  validateTransactionBasic(data)

  // user_idとreasonの必須チェック
  if (!data.user_id || !data.reason) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Required fields are missing'
    })
  }
}

/**
 * 出金時の残高チェック
 */
export async function validateWithdrawalBalance(
  userId: string, 
  amount: number, 
  getBalanceFunction: (userId: string) => Promise<number>
): Promise<void> {
  if (amount >= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Amount must be negative for withdrawal transactions'
    })
  }

  const currentBalance = await getBalanceFunction(userId)
  
  if (Math.abs(amount) > currentBalance) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Insufficient balance for withdrawal'
    })
  }
}

/**
 * 管理者用の出金残高チェック（より詳細なエラーメッセージ）
 */
export async function validateAdminWithdrawalBalance(
  userId: string, 
  amount: number, 
  getBalanceFunction: (userId: string) => Promise<number>
): Promise<void> {
  if (amount >= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Amount must be negative for withdrawal transactions'
    })
  }

  const currentBalance = await getBalanceFunction(userId)
  
  if (currentBalance < Math.abs(amount)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Insufficient balance. Current balance: ${currentBalance} BTC`
    })
  }
}