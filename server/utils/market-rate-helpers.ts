import { getDynamoDBService } from '~/server/utils/dynamodb'
import type { MarketRate } from '~/types'

/**
 * 全ての相場を新しい順で取得する
 * market_ratesテーブルは時系列で引けるキー設計ではないため全件scanしてソートする
 * （レート固定運用のため件数は少ない想定）
 */
export async function getAllMarketRatesDesc(): Promise<MarketRate[]> {
  const dynamodb = getDynamoDBService()
  const tableName = dynamodb.getTableName('market_rates')

  const result = await dynamodb.scan(tableName)
  return (result.items as MarketRate[])
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

/**
 * 最新の相場を取得する（相場が1件もない場合はnull）
 */
export async function getLatestMarketRate(): Promise<MarketRate | null> {
  const rates = await getAllMarketRatesDesc()
  return rates[0] || null
}
