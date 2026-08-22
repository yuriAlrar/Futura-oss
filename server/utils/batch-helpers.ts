import type { BatchOperation, Transaction, User } from '~/types'
import { BATCH_OPERATION_STATUS } from '~/types'
import { getDynamoDBService } from '~/server/utils/dynamodb'
import { calculateBalance } from '~/server/utils/transaction-helpers'
import { generateTransactionId } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'

const logger = useLogger({ prefix: '[BatchHelpers]' })

/**
 * 特定ユーザーの現在の残高を取得
 */
export async function getUserBalance(userId: string): Promise<number> {
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
    return calculateBalance(transactions)
  } catch (error) {
    logger.error(`ユーザー ${userId} の残高取得エラー:`, error)
    return 0
  }
}

/**
 * 一括処理レコードを作成
 */
export async function createBatchOperation(
  batchId: string,
  adjustmentRate: number,
  targetUserCount: number,
  createdBy: string,
  memo?: string,
  targetSegmentId?: string
): Promise<BatchOperation> {
  const dynamodb = getDynamoDBService()
  const batchOperationsTableName = dynamodb.getTableName('batch_operations')

  const now = new Date().toISOString()
  const batchOperation: BatchOperation = {
    batch_id: batchId,
    operation_type: 'btc_adjustment',
    adjustment_rate: adjustmentRate,
    target_user_count: targetUserCount,
    processed_user_count: 0,
    failed_user_count: 0,
    status: BATCH_OPERATION_STATUS.PENDING,
    created_by: createdBy,
    created_at: now,
    memo,
    target_segment_id: targetSegmentId
  }

  await dynamodb.put(batchOperationsTableName, batchOperation as unknown as Record<string, unknown>)
  return batchOperation
}

/**
 * 一括処理レコードのステータスを更新
 */
export async function updateBatchOperationStatus(
  batchId: string,
  status: typeof BATCH_OPERATION_STATUS[keyof typeof BATCH_OPERATION_STATUS],
  updates: {
    processed_user_count?: number
    failed_user_count?: number
    started_at?: string
    completed_at?: string
    error_message?: string
  }
): Promise<void> {
  const dynamodb = getDynamoDBService()
  const batchOperationsTableName = dynamodb.getTableName('batch_operations')

  const updateExpressions: string[] = ['#status = :status']
  const expressionAttributeNames: Record<string, string> = { '#status': 'status' }
  const expressionAttributeValues: Record<string, unknown> = { ':status': status }

  if (updates.processed_user_count !== undefined) {
    updateExpressions.push('#processed_user_count = :processed_user_count')
    expressionAttributeNames['#processed_user_count'] = 'processed_user_count'
    expressionAttributeValues[':processed_user_count'] = updates.processed_user_count
  }

  if (updates.failed_user_count !== undefined) {
    updateExpressions.push('#failed_user_count = :failed_user_count')
    expressionAttributeNames['#failed_user_count'] = 'failed_user_count'
    expressionAttributeValues[':failed_user_count'] = updates.failed_user_count
  }

  if (updates.started_at) {
    updateExpressions.push('#started_at = :started_at')
    expressionAttributeNames['#started_at'] = 'started_at'
    expressionAttributeValues[':started_at'] = updates.started_at
  }

  if (updates.completed_at) {
    updateExpressions.push('#completed_at = :completed_at')
    expressionAttributeNames['#completed_at'] = 'completed_at'
    expressionAttributeValues[':completed_at'] = updates.completed_at
  }

  if (updates.error_message) {
    updateExpressions.push('#error_message = :error_message')
    expressionAttributeNames['#error_message'] = 'error_message'
    expressionAttributeValues[':error_message'] = updates.error_message
  }

  await dynamodb.update(
    batchOperationsTableName,
    { batch_id: batchId },
    `SET ${updateExpressions.join(', ')}`,
    expressionAttributeValues as any,
    expressionAttributeNames
  )
}

/**
 * 指定されたbatch_idで既に処理済みのユーザーIDセットを取得
 */
export async function getProcessedUserIds(batchId: string): Promise<Set<string>> {
  const dynamodb = getDynamoDBService()
  const transactionsTableName = dynamodb.getTableName('transactions')

  try {
    const result = await dynamodb.query(
      transactionsTableName,
      'transaction_id = :transaction_id',
      { ':transaction_id': batchId }
    )

    const transactions = result.items as Transaction[]
    return new Set(transactions.map(t => t.user_id))
  } catch (error) {
    logger.error(`処理済みユーザー取得エラー (batch_id: ${batchId}):`, error)
    return new Set()
  }
}

/**
 * トランザクションを一括作成（DynamoDB BatchWriteItem使用）
 */
export async function batchCreateTransactions(
  transactions: Transaction[]
): Promise<{ successCount: number; failedCount: number; errors: Array<{ user_id: string; error: string }> }> {
  const dynamodb = getDynamoDBService()
  const transactionsTableName = dynamodb.getTableName('transactions')

  let successCount = 0
  let failedCount = 0
  const errors: Array<{ user_id: string; error: string }> = []

  // DynamoDB BatchWriteItemは最大25アイテムまで
  const BATCH_SIZE = 25

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE)

    try {
      // バッチ書き込み（TransactWrite使用）
      await dynamodb.transactWrite(
        batch.map(t => ({
          Put: {
            TableName: transactionsTableName,
            Item: t as unknown as Record<string, unknown>
          }
        }))
      )

      successCount += batch.length
      logger.info(`バッチ処理成功: ${i + 1}-${i + batch.length}/${transactions.length}`)
    } catch (error) {
      logger.error(`バッチ処理エラー (${i + 1}-${i + batch.length}):`, error)

      // バッチ失敗時は個別に処理
      for (const transaction of batch) {
        try {
          await dynamodb.put(transactionsTableName, transaction as unknown as Record<string, unknown>)
          successCount++
        } catch (putError) {
          failedCount++
          errors.push({
            user_id: transaction.user_id,
            error: putError instanceof Error ? putError.message : String(putError)
          })
          logger.error(`個別書き込み失敗 (user_id: ${transaction.user_id}):`, putError)
        }
      }
    }
  }

  return { successCount, failedCount, errors }
}

/**
 * 一括処理のトランザクション作成
 *
 * @param batchId 一括処理ID
 * @param users 対象ユーザー一覧
 * @param adjustmentRate 増減率（%）
 * @param createdBy 実行者ID
 * @param memo メモ（トランザクションのreasonに使用）
 */
export async function createBatchTransactions(
  batchId: string,
  users: User[],
  adjustmentRate: number,
  createdBy: string,
  memo?: string
): Promise<{ successCount: number; failedCount: number; errors: Array<{ user_id: string; error: string }> }> {
  const now = new Date().toISOString()
  const transactions: Transaction[] = []

  // 既に処理済みのユーザーを取得（冪等性確保）
  const processedUserIds = await getProcessedUserIds(batchId)

  for (const user of users) {
    // 既に処理済みならスキップ
    if (processedUserIds.has(user.user_id)) {
      logger.info(`ユーザー ${user.user_id} は既に処理済み（スキップ）`)
      continue
    }

    try {
      // 現在の残高を取得
      const currentBalance = await getUserBalance(user.user_id)

      // 増減額を計算
      const adjustmentAmount = (currentBalance * adjustmentRate) / 100

      // 増減額が0の場合はスキップ
      if (adjustmentAmount === 0) {
        logger.info(`ユーザー ${user.user_id} の増減額が0（スキップ）`)
        continue
      }

      // トランザクション作成
      const transaction: Transaction = {
        transaction_id: batchId, // 一括処理IDを使用
        user_id: user.user_id,
        amount: adjustmentAmount, // 符号付きで保存
        transaction_type: 'asset_management',
        timestamp: now,
        created_by: createdBy,
        reason: '資産運用',
        memo: `asset_manage_id: ${batchId}${memo ? ` | ${memo}` : ''}`
      }

      transactions.push(transaction)
    } catch (error) {
      logger.error(`ユーザー ${user.user_id} のトランザクション作成準備エラー:`, error)
    }
  }

  logger.info(`作成するトランザクション数: ${transactions.length}`)

  // 一括書き込み実行
  return await batchCreateTransactions(transactions)
}
