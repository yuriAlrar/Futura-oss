import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { TransactionRequestForm, EnhancedTransaction } from '~/types'
import { TRANSACTION_STATUS } from '~/types'
import { generateTransactionId } from '~/server/utils/uuid'
import { validateTransactionRequest, validateWithdrawalBalance, getTotalBalance } from '~/server/utils/transaction-helpers'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[TransactionRequest]' })
  
  try {
    // 権限チェック: transaction:request
    const currentUser = await requirePermission(event, 'transaction:request')
    
    // リクエストボディの取得とバリデーション
    const body = await readBody<TransactionRequestForm>(event)
    
    // 共通バリデーション関数を使用
    validateTransactionRequest(body)
    
    // 出金の場合は残高チェック
    if (body.transaction_type === 'withdrawal') {
      await validateWithdrawalBalance(currentUser.user_id, body.amount, getTotalBalance)
    }
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const marketRatesTableName = dynamodb.getTableName('market_rates')

    // リクエスト時点のレートでJPY換算額をスナップショット保存する
    // （現在はレート固定運用のため実質amountと同値だが、将来のレート変動再開に備える）
    let requestedJpyAmount: number | undefined
    try {
      const ratesResult = await dynamodb.scan(marketRatesTableName)
      const rates = ratesResult.items as { timestamp: string; btc_jpy_rate: number }[]
      if (rates.length > 0) {
        const latestRate = rates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
        requestedJpyAmount = Math.round(body.amount * latestRate.btc_jpy_rate)
      }
    } catch (rateError: unknown) {
      logger.warn('レート取得に失敗したため、requested_jpy_amountのスナップショットを省略します:', rateError)
    }

    // 1. 既存の承認待ちリクエストをチェック
    const existingPendingResult = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id AND #status = :status',
      { 
        ':user_id': currentUser.user_id,
        ':status': TRANSACTION_STATUS.PENDING
      },
      {
        indexName: 'TransactionUserStatusIndex',
        expressionAttributeNames: { '#status': 'status' }
      }
    )
    
    if (existingPendingResult.items.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'You already have a pending transaction request'
      })
    }
    
    // 2. 1日あたりのリクエスト回数制限をチェック
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()
    
    const todaysRequestsResult = await dynamodb.query(
      transactionsTableName,
      'user_id = :user_id',
      { 
        ':user_id': currentUser.user_id,
        ':today': todayISO 
      },
      {
        indexName: 'UserTimestampIndex',
        filterExpression: 'requested_at >= :today'
      }
    )
    
    if (todaysRequestsResult.items.length >= 50) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Daily request limit exceeded (5 requests per day)'
      })
    }
    
    // 3. 取引リクエストを作成
    const transactionId = generateTransactionId()
    const now = new Date().toISOString()
    
    const transactionRequest: EnhancedTransaction = {
      transaction_id: transactionId,
      user_id: currentUser.user_id,
      amount: body.amount,
      transaction_type: body.transaction_type,
      timestamp: now, // 将来の承認時に更新される
      created_by: currentUser.user_id,
      memo: body.memo || '',
      reason: body.reason,
      status: TRANSACTION_STATUS.PENDING,
      requested_at: now,
      requested_jpy_amount: requestedJpyAmount
    }
    
    await dynamodb.put(transactionsTableName, transactionRequest as any)
    
    const transactionTypeJa = body.transaction_type === 'deposit' ? '入金' : '出金'
    logger.info(`${transactionTypeJa}リクエストを作成しました: ${transactionId} - ${currentUser.email} - ${body.amount} BTC`)
    
    return {
      success: true,
      data: {
        transaction_id: transactionRequest.transaction_id,
        user_id: transactionRequest.user_id,
        amount: transactionRequest.amount,
        transaction_type: transactionRequest.transaction_type,
        status: transactionRequest.status,
        requested_at: transactionRequest.requested_at,
        memo: transactionRequest.memo,
        reason: transactionRequest.reason
      },
      message: 'Transaction request created successfully'
    }
    
  } catch (error: unknown) {
    logger.error('入出金リクエスト作成エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create transaction request'
    })
  }
})