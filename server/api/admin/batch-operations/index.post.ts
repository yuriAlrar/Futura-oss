import { generateTransactionId } from '~/server/utils/uuid'
import { useLogger } from '~/composables/useLogger'
import { BATCH_OPERATION_STATUS } from '~/types'
import type { BatchOperationCreateForm, BatchOperationResult } from '~/types'
import {
  createBatchOperation,
  updateBatchOperationStatus,
  createBatchTransactions
} from '~/server/utils/batch-helpers'
import { getBatchTargetUsers } from '~/server/utils/segment-helpers'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminBatchOperations-POST]' })

  try {
    // Require batch:execute permission
    const currentUser = await requirePermission(event, 'batch:execute')

    const body = await readBody<BatchOperationCreateForm>(event)
    const { adjustment_rate, memo, target_segment_id } = body

    // Validation
    if (adjustment_rate === undefined || adjustment_rate === null) {
      throw createError({
        statusCode: 400,
        statusMessage: 'adjustment_rate is required'
      })
    }

    if (adjustment_rate <= -100) {
      throw createError({
        statusCode: 400,
        statusMessage: 'adjustment_rate must be greater than -100%'
      })
    }

    // Generate batch ID
    const batchId = generateTransactionId()
    logger.info(`一括処理開始 (batch_id: ${batchId}, rate: ${adjustment_rate}%)`)

    // Get target users（セグメント指定時はそのセグメント所属ユーザーのみ、未指定時は全アクティブユーザー。
    // いずれの場合も運用停止ステートのユーザーは除外される）
    const activeUsers = await getBatchTargetUsers(target_segment_id)
    if (activeUsers.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No active users found'
      })
    }

    logger.info(`対象ユーザー数: ${activeUsers.length}${target_segment_id ? ` (segment: ${target_segment_id})` : ''}`)

    // Create batch operation record
    await createBatchOperation(
      batchId,
      adjustment_rate,
      activeUsers.length,
      currentUser.user_id,
      memo,
      target_segment_id
    )

    // Update status to processing
    const startedAt = new Date().toISOString()
    await updateBatchOperationStatus(batchId, BATCH_OPERATION_STATUS.PROCESSING, {
      started_at: startedAt
    })

    // Execute batch transaction creation
    let processedCount = 0
    let failedCount = 0
    const allErrors: Array<{ user_id: string; error: string }> = []

    try {
      const result = await createBatchTransactions(
        batchId,
        activeUsers,
        adjustment_rate,
        currentUser.user_id,
        memo
      )

      processedCount = result.successCount
      failedCount = result.failedCount
      allErrors.push(...result.errors)

      logger.info(`処理完了: 成功=${processedCount}, 失敗=${failedCount}`)

      // Update status to completed or failed
      const completedAt = new Date().toISOString()
      const finalStatus = failedCount === activeUsers.length
        ? BATCH_OPERATION_STATUS.FAILED
        : BATCH_OPERATION_STATUS.COMPLETED

      await updateBatchOperationStatus(batchId, finalStatus, {
        processed_user_count: processedCount,
        failed_user_count: failedCount,
        completed_at: completedAt,
        error_message: allErrors.length > 0
          ? `${allErrors.length} errors occurred. First error: ${allErrors[0].error}`
          : undefined
      })

      const response: BatchOperationResult = {
        batch_id: batchId,
        status: finalStatus,
        target_user_count: activeUsers.length,
        processed_user_count: processedCount,
        failed_user_count: failedCount,
        errors: allErrors.length > 0 ? allErrors : undefined
      }

      return {
        success: true,
        data: response,
        message: `Batch operation completed. Processed: ${processedCount}, Failed: ${failedCount}`
      }
    } catch (executionError: unknown) {
      logger.error('一括処理実行エラー:', executionError)

      // Update status to failed
      const completedAt = new Date().toISOString()
      await updateBatchOperationStatus(batchId, BATCH_OPERATION_STATUS.FAILED, {
        processed_user_count: processedCount,
        failed_user_count: activeUsers.length - processedCount,
        completed_at: completedAt,
        error_message: executionError instanceof Error ? executionError.message : String(executionError)
      })

      throw executionError
    }
  } catch (error: unknown) {
    logger.error('一括処理作成エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create batch operation'
    })
  }
})
