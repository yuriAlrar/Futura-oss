import type { DynamoDBDocumentClient, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb'
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import type { RuntimeConfig } from '@nuxt/schema'
import { createDynamoDBDocumentClient } from './client-factory'
import { useLogger } from '~/composables/useLogger'

// DynamoDBドキュメント値の型
type DynamoDBValue = string | number | boolean | null | DynamoDBValue[] | { [key: string]: DynamoDBValue }
type DynamoDBRecord = Record<string, DynamoDBValue>

const logger = useLogger({ prefix: '[DynamoDB]' })

/**
 * DynamoDBに渡す1ページあたりのLimitを決める
 * フィルタ式がある場合、DynamoDBのLimitはフィルタ前の評価件数に掛かるため、
 * 小さい値を渡すと往復回数が膨らむ。そのためフィルタありでは指定せず1MB単位で取得する
 */
function resolvePageLimit(maxItems: number | undefined, fetchedCount: number, filterExpression?: string): number | undefined {
  if (maxItems === undefined || filterExpression) {
    return undefined
  }
  return Math.max(maxItems - fetchedCount, 1)
}

/**
 * 返却上限件数に達したかどうか
 */
function hasReachedLimit(maxItems: number | undefined, fetchedCount: number): boolean {
  return maxItems !== undefined && fetchedCount >= maxItems
}

/**
 * TransactWriteがConditionExpressionの不成立でキャンセルされたかどうか
 */
export function isTransactionConditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error) || error.name !== 'TransactionCanceledException') {
    return false
  }
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons || []
  return reasons.some(reason => reason.Code === 'ConditionalCheckFailed')
}

class DynamoDBService {
  private client: DynamoDBDocumentClient
  private config: RuntimeConfig

  constructor() {
    this.config = useRuntimeConfig()
    logger.info('DynamoDBService初期化中...')
    try {
      this.client = createDynamoDBDocumentClient()
      logger.info('DynamoDBクライアント作成完了')
    } catch (error) {
      logger.error('DynamoDBクライアント作成エラー:', error)
      throw error
    }
  }

  // 汎用的なCRUD操作
  async get(tableName: string, key: DynamoDBRecord) {
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    })
    
    const response = await this.client.send(command)
    return response.Item
  }

  async put(tableName: string, item: Record<string, unknown>) {
    logger.debug(`Putコマンド実行: テーブル=${tableName}`)

    try {
      const command = new PutCommand({
        TableName: tableName,
        Item: item
      })

      await this.client.send(command)
      logger.debug(`Put完了: テーブル=${tableName}`)
      return item
    } catch (error) {
      logger.error(`Putエラー: テーブル=${tableName}`, error)
      throw error
    }
  }

  async update(tableName: string, key: DynamoDBRecord, updateExpression: string, expressionAttributeValues: DynamoDBRecord, expressionAttributeNames?: Record<string, string>, conditionExpression?: string) {
    const command = new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ConditionExpression: conditionExpression,
      ReturnValues: 'ALL_NEW'
    })

    const response = await this.client.send(command)
    return response.Attributes
  }

  async delete(tableName: string, key: DynamoDBRecord) {
    const command = new DeleteCommand({
      TableName: tableName,
      Key: key
    })
    
    await this.client.send(command)
  }

  /**
   * Query実行
   * - fetchAll（既定true）: LastEvaluatedKeyがなくなるまで全ページを取得する
   * - limit: 返却する最大件数。指定時は件数に達した時点で取得を打ち切り、itemsをlimit件に切り詰める
   *   （切り詰めた場合のlastEvaluatedKeyは再開位置として正確ではない）
   * - fetchAll: false: 1ページのみ取得する
   * - select: 'COUNT' の場合itemsは空で、countに総件数が入る
   */
  async query(tableName: string, keyConditionExpression: string, expressionAttributeValues: DynamoDBRecord, options?: {
    indexName?: string
    filterExpression?: string
    expressionAttributeNames?: Record<string, string>
    limit?: number
    scanIndexForward?: boolean
    exclusiveStartKey?: Record<string, any>
    fetchAll?: boolean
    select?: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'SPECIFIC_ATTRIBUTES' | 'COUNT'
  }) {
    const fetchAll = options?.fetchAll ?? true
    const maxItems = options?.limit
    let items: any[] = []
    let lastEvaluatedKey = options?.exclusiveStartKey
    let count = 0

    do {
      const command: QueryCommand = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        IndexName: options?.indexName,
        FilterExpression: options?.filterExpression,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        Limit: resolvePageLimit(maxItems, count, options?.filterExpression),
        ScanIndexForward: options?.scanIndexForward,
        Select: options?.select,
        ExclusiveStartKey: lastEvaluatedKey
      })

      const response = await this.client.send(command)
      items = items.concat(response.Items || [])
      lastEvaluatedKey = response.LastEvaluatedKey
      count += response.Count || 0

      // fetchAll が false の場合、上限件数に達した場合、または lastEvaluatedKey がなくなった場合は終了
    } while (fetchAll && lastEvaluatedKey && !hasReachedLimit(maxItems, count))

    if (maxItems !== undefined && items.length > maxItems) {
      items = items.slice(0, maxItems)
      count = items.length
    }

    return {
      items,
      lastEvaluatedKey,
      count
    }
  }

  /**
   * Scan実行
   * - fetchAll（既定true）: LastEvaluatedKeyがなくなるまで全ページを取得する
   * - limit: 返却する最大件数。指定時は件数に達した時点で取得を打ち切り、itemsをlimit件に切り詰める
   *   （切り詰めた場合のlastEvaluatedKeyは再開位置として正確ではない）
   * - fetchAll: false: 1ページのみ取得する
   * - select: 'COUNT' の場合itemsは空で、countに総件数が入る
   */
  async scan(tableName: string, options?: {
    filterExpression?: string
    expressionAttributeValues?: DynamoDBRecord
    expressionAttributeNames?: Record<string, string>
    limit?: number
    select?: 'ALL_ATTRIBUTES' | 'ALL_PROJECTED_ATTRIBUTES' | 'SPECIFIC_ATTRIBUTES' | 'COUNT'
    exclusiveStartKey?: Record<string, any>
    fetchAll?: boolean
  }) {
    logger.debug(`Scanコマンド実行: テーブル=${tableName}, Select=${options?.select || 'ALL_ATTRIBUTES'}`)
    const fetchAll = options?.fetchAll ?? true
    const maxItems = options?.limit
    let items: any[] = []
    let lastEvaluatedKey = options?.exclusiveStartKey
    let count = 0

    try {
      do {
        const command: ScanCommand = new ScanCommand({
          TableName: tableName,
          FilterExpression: options?.filterExpression,
          ExpressionAttributeValues: options?.expressionAttributeValues,
          ExpressionAttributeNames: options?.expressionAttributeNames,
          Limit: resolvePageLimit(maxItems, count, options?.filterExpression),
          Select: options?.select,
          ExclusiveStartKey: lastEvaluatedKey
        })

        const response = await this.client.send(command)
        items = items.concat(response.Items || [])
        lastEvaluatedKey = response.LastEvaluatedKey
        count += response.Count || 0

      } while (fetchAll && lastEvaluatedKey && !hasReachedLimit(maxItems, count))

      if (maxItems !== undefined && items.length > maxItems) {
        items = items.slice(0, maxItems)
        count = items.length
      }

      logger.debug(`Scan完了: テーブル=${tableName}, 合計取得レコード数=${count}`)

      return {
        items,
        lastEvaluatedKey,
        count
      }
    } catch (error) {
      logger.error(`Scanエラー: テーブル=${tableName}`, error)
      throw error
    }
  }

  // 特定のテーブル用のヘルパーメソッド
  getTableName(table: 'users' | 'transactions' | 'market_rates' | 'sessions' | 'permissions' | 'batch_operations' | 'segments' | 'user_segments' | 'invites'): string {
    const tableMap = {
      'users': this.config.dynamodbUsersTable,
      'transactions': this.config.dynamodbTransactionsTable,
      'market_rates': this.config.dynamodbMarketRatesTable,
      'sessions': this.config.dynamodbSessionsTable,
      'permissions': this.config.dynamodbPermissionsTable,
      'batch_operations': this.config.dynamodbBatchOperationsTable,
      'segments': this.config.dynamodbSegmentsTable,
      'user_segments': this.config.dynamodbUserSegmentsTable,
      'invites': this.config.dynamodbInvitesTable
    }

    const tableName = tableMap[table]
    if (!tableName) {
      logger.error(`テーブル '${table}' の環境変数が未設定`)
      logger.error('現在の設定:', {
        users: this.config.dynamodbUsersTable,
        transactions: this.config.dynamodbTransactionsTable,
        market_rates: this.config.dynamodbMarketRatesTable,
        sessions: this.config.dynamodbSessionsTable,
        permissions: this.config.dynamodbPermissionsTable,
        batch_operations: this.config.dynamodbBatchOperationsTable,
        segments: this.config.dynamodbSegmentsTable,
        user_segments: this.config.dynamodbUserSegmentsTable,
        invites: this.config.dynamodbInvitesTable
      })
      throw new Error(`Environment variable for table '${table}' is not configured`)
    }

    logger.debug(`テーブル名取得: ${table} -> ${tableName}`)
    return tableName
  }

  // トランザクション操作
  async transactWrite(items: NonNullable<TransactWriteCommandInput['TransactItems']>) {
    const command = new TransactWriteCommand({
      TransactItems: items
    })
    
    await this.client.send(command)
  }
}

// シングルトンインスタンスの作成
let dynamoService: DynamoDBService

export const getDynamoDBService = () => {
  if (!dynamoService) {
    dynamoService = new DynamoDBService()
  }
  return dynamoService
}