import { getDynamoDBService, isTransactionConditionFailed } from '~/server/utils/dynamodb'
import { getTotalBalance } from '~/server/utils/transaction-helpers'
import { useLogger } from '~/composables/useLogger'
import type { TransactionApprovalForm, EnhancedTransaction, User } from '~/types'
import { TRANSACTION_STATUS } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminTransactionApproval]' })
  
  try {
    // 権限チェック: transaction:approve
    const currentUser = await requirePermission(event, 'transaction:approve')
    
    const transactionId = getRouterParam(event, 'transactionId')
    if (!transactionId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Transaction ID is required'
      })
    }
    
    // リクエストボディの取得とバリデーション
    const body = await readBody<TransactionApprovalForm>(event)
    
    const validStatuses = [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.REJECTED]
    if (!body.status || !validStatuses.includes(body.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Status must be ${validStatuses.join(' or ')}`
      })
    }
    
    if (body.status === TRANSACTION_STATUS.REJECTED && !body.rejection_reason) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Rejection reason is required when rejecting'
      })
    }
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const usersTableName = dynamodb.getTableName('users')
    
    // 1. 既存のトランザクションを取得
    const existingTransactions = await dynamodb.query(
      transactionsTableName,
      'transaction_id = :transaction_id',
      { ':transaction_id': transactionId }
    )
    
    if (existingTransactions.items.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Transaction not found'
      })
    }

    // 一括処理の取引は同一transaction_idを複数ユーザーで共有するため、リクエスト取引ではない
    if (existingTransactions.items.length > 1) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Transaction is not a transaction request'
      })
    }
    
    const transaction = existingTransactions.items[0] as EnhancedTransaction
    
    // 2. ステータスチェック（pending状態のみ処理可能）
    if (transaction.status !== TRANSACTION_STATUS.PENDING) {
      throw createError({
        statusCode: 409,
        statusMessage: `Transaction is already ${transaction.status || TRANSACTION_STATUS.APPROVED}`
      })
    }
    
    // 3. ユーザー情報を取得
    const user = await dynamodb.get(usersTableName, { user_id: transaction.user_id }) as User
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // 4. 出金承認時は承認時点の残高で再チェックする
    //    （リクエスト後に一括調整や管理者出金で残高が減っている可能性があるため）
    //    対象のpending取引自体は承認済みではないため残高計算に含まれない
    if (body.status === TRANSACTION_STATUS.APPROVED && transaction.transaction_type === 'withdrawal') {
      const currentBalance = await getTotalBalance(transaction.user_id)
      if (Math.abs(transaction.amount) > currentBalance) {
        throw createError({
          statusCode: 400,
          statusMessage: `Insufficient balance. Current balance: ${currentBalance}`
        })
      }
    }
    
    const now = new Date().toISOString()
    
    // 5. トランザクションを更新
    //    pending状態であることを条件にし、同時操作による二重処理（承認と拒否の上書き等）を防ぐ
    const updateExpressions = ['#status = :status', 'processed_at = :processed_at', 'processed_by = :processed_by']
    const expressionAttributeValues: Record<string, unknown> = {
      ':status': body.status,
      ':pending': TRANSACTION_STATUS.PENDING,
      ':processed_at': now,
      ':processed_by': currentUser.user_id
    }
    if (body.status === TRANSACTION_STATUS.APPROVED) {
      // 承認時のみタイムスタンプ更新
      updateExpressions.push('#timestamp = :timestamp')
      expressionAttributeValues[':timestamp'] = now
    } else {
      updateExpressions.push('rejection_reason = :rejection_reason')
      expressionAttributeValues[':rejection_reason'] = body.rejection_reason
    }

    const transactItems: Parameters<typeof dynamodb.transactWrite>[0] = [
      {
        Update: {
          TableName: transactionsTableName,
          Key: { transaction_id: transaction.transaction_id, user_id: transaction.user_id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: body.status === TRANSACTION_STATUS.APPROVED
            ? { '#status': 'status', '#timestamp': 'timestamp' }
            : { '#status': 'status' },
          ExpressionAttributeValues: expressionAttributeValues
        }
      }
    ]

    // リクエスト作成時に設定したロックを解除する（ロック導入前のリクエストはロックが無いため対象外）
    if (user.pending_request_id === transaction.transaction_id) {
      transactItems.push({
        Update: {
          TableName: usersTableName,
          Key: { user_id: transaction.user_id },
          UpdateExpression: 'REMOVE pending_request_id',
          ConditionExpression: 'pending_request_id = :transaction_id',
          ExpressionAttributeValues: { ':transaction_id': transaction.transaction_id }
        }
      })
    }

    try {
      await dynamodb.transactWrite(transactItems)
    } catch (writeError: unknown) {
      if (isTransactionConditionFailed(writeError)) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Transaction has already been processed'
        })
      }
      throw writeError
    }
    
    // 6. 承認時の残高計算
    let newBalance: number | undefined
    if (body.status === TRANSACTION_STATUS.APPROVED) {
      newBalance = await getTotalBalance(transaction.user_id)
      logger.info(`取引承認完了: ${transactionId} - ${user.email} - ${transaction.amount} BTC - 新残高: ${newBalance} BTC`)
    } else {
      logger.info(`取引拒否完了: ${transactionId} - ${user.email} - ${transaction.amount} BTC - 理由: ${body.rejection_reason}`)
    }
    
    return {
      success: true,
      data: {
        transaction_id: transactionId,
        status: body.status,
        processed_at: now,
        processed_by: currentUser.user_id,
        user_name: user.name,
        user_email: user.email,
        new_balance: newBalance,
        rejection_reason: body.status === TRANSACTION_STATUS.REJECTED ? body.rejection_reason : undefined
      },
      message: `Transaction ${body.status} successfully`
    }
    
  } catch (error: unknown) {
    logger.error('取引承認/拒否エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process transaction approval'
    })
  }
})