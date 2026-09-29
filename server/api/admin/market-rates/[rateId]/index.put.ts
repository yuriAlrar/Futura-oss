import { getDynamoDBService } from '~/server/utils/dynamodb'
import { requirePermission } from '~/server/utils/auth'
import { useLogger } from '~/composables/useLogger'
import type { MarketRate, MarketRateUpdateForm, ApiResponse } from '~/types'

export default defineEventHandler(async (event): Promise<ApiResponse<MarketRate>> => {
  const logger = useLogger({ prefix: '[MarketRateUpdate]' })
  try {
    const currentUser = await requirePermission(event, 'market_rate:create')

    const rateId = getRouterParam(event, 'rateId')
    if (!rateId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Rate ID is required'
      })
    }

    const body = await readBody<MarketRateUpdateForm>(event)
    const { timestamp, btc_jpy_rate } = body

    if (!timestamp || !btc_jpy_rate) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Timestamp and rate are required'
      })
    }

    if (btc_jpy_rate <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Rate must be positive'
      })
    }

    const rateDate = new Date(timestamp)
    if (isNaN(rateDate.getTime())) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid timestamp format'
      })
    }

    const dynamodb = getDynamoDBService()
    const tableName = dynamodb.getTableName('market_rates')

    // rate_idはパーティションキーのためqueryで取得する
    const existingRateResult = await dynamodb.query(
      tableName,
      'rate_id = :rate_id',
      { ':rate_id': rateId }
    )

    if (existingRateResult.items.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Market rate not found'
      })
    }

    const existingRate = existingRateResult.items[0] as MarketRate
    // タイムゾーンの解釈違いを防ぐため、UTCのISO文字列に正規化して保存する
    const normalizedTimestamp = rateDate.toISOString()
    const now = new Date().toISOString()

    const updatedMarketRate: MarketRate = {
      rate_id: rateId,
      timestamp: normalizedTimestamp,
      btc_jpy_rate,
      created_by: existingRate.created_by,
      created_at: existingRate.created_at,
      updated_at: now,
      updated_by: currentUser.user_id
    }

    if (existingRate.timestamp === normalizedTimestamp) {
      // キーが変わらない場合は同一アイテムの更新のみ
      // （同一キーへのDelete+Putは1トランザクション内で実行できないため）
      await dynamodb.update(
        tableName,
        { rate_id: rateId, timestamp: normalizedTimestamp },
        'SET btc_jpy_rate = :btc_jpy_rate, updated_at = :updated_at, updated_by = :updated_by',
        {
          ':btc_jpy_rate': btc_jpy_rate,
          ':updated_at': now,
          ':updated_by': currentUser.user_id
        }
      )
    } else {
      // タイムスタンプがキーの一部のため、削除→作成のトランザクションで更新する
      await dynamodb.transactWrite([
        {
          Delete: {
            TableName: tableName,
            Key: {
              rate_id: rateId,
              timestamp: existingRate.timestamp
            }
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: updatedMarketRate as unknown as Record<string, unknown>
          }
        }
      ])
    }

    logger.info(`内部レートを更新しました: ${rateId} - ${currentUser.email} - ¥${btc_jpy_rate}`)

    return {
      success: true,
      data: updatedMarketRate,
      message: 'Market rate updated successfully'
    }
  } catch (error: unknown) {
    logger.error('内部レート更新エラー:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update market rate'
    })
  }
})
