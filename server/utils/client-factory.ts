// 1. 外部ライブラリ
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client } from '@aws-sdk/client-s3'

// 2. 内部composables（ユニバーサル）
import { useLogger } from '~/composables/useLogger'

// Server-side logger (useLogger composable使用)
const logger = useLogger({ prefix: '[CLIENT-FACTORY]' })

/**
 * Lambda環境かどうかを判定
 */
function isLambdaEnvironment(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_RUNTIME_DIR
  )
}

/**
 * 共通のAWS設定を取得
 */
function getBaseAwsConfig() {
  const config = useRuntimeConfig()
  
  const baseConfig = {
    region: config.awsRegion || process.env.AWS_REGION || 'us-east-1'
  }
  
  // Lambda環境では IAMロール を自動使用
  if (isLambdaEnvironment()) {
    logger.debug('AWS認証にLambda IAMロールを使用します')
    return baseConfig
  }
  
  // Lambda以外の環境では明示的なクレデンシャル設定が必要
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    logger.debug('環境変数からAWS認証情報を使用します')
    return {
      ...baseConfig,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
      }
    }
  }
  
  // プロファイルベースの認証（AWS CLI設定）
  if (process.env.AWS_PROFILE) {
    logger.debug(`AWSプロファイルを使用します: ${process.env.AWS_PROFILE}`)
    return baseConfig
  }
  
  // 認証情報が不足している場合の警告
  logger.warn('AWS認証情報が見つかりません。AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEYまたはAWS_PROFILEを設定してください')
  return baseConfig
}

/**
 * Cognito Identity Provider クライアントのファクトリー
 */
export function createCognitoClient(): CognitoIdentityProviderClient {
  const config = getBaseAwsConfig()
  
  logger.debug(`${isLambdaEnvironment() ? 'Lambda' : 'ローカル'}環境用のCognitoクライアントを作成中`)
  
  return new CognitoIdentityProviderClient(config)
}

/**
 * DynamoDB クライアントのファクトリー（常に本番DynamoDBを使用）
 */
export function createDynamoDBClient(): DynamoDBClient {
  const config = getBaseAwsConfig()
  
  logger.debug(`${isLambdaEnvironment() ? 'Lambda' : 'ローカル'}環境用のDynamoDBクライアントを作成中`)
  
  return new DynamoDBClient(config)
}

/**
 * DynamoDB Document クライアントのファクトリー
 */
export function createDynamoDBDocumentClient(): DynamoDBDocumentClient {
  const dynamoDbClient = createDynamoDBClient()
  
  return DynamoDBDocumentClient.from(dynamoDbClient, {
    marshallOptions: {
      convertEmptyValues: false,
      removeUndefinedValues: true,
      convertClassInstanceToMap: false
    },
    unmarshallOptions: {
      wrapNumbers: false
    }
  })
}

/**
 * S3 クライアントのファクトリー（常に本番S3を使用）
 */
export function createS3Client(): S3Client {
  const config = getBaseAwsConfig()
  
  logger.debug(`${isLambdaEnvironment() ? 'Lambda' : 'ローカル'}環境用のS3クライアントを作成中`)
  
  return new S3Client(config)
}

/**
 * 環境設定の診断情報を取得
 */
export function getEnvironmentDiagnostics() {
  return {
    environmentType: isLambdaEnvironment() ? 'lambda' : 'local',
    isLambda: isLambdaEnvironment(),
    region: process.env.AWS_REGION || 'us-east-1',
    hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    hasProfile: !!process.env.AWS_PROFILE,
    nodeEnv: process.env.NODE_ENV,
    lambdaFunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    awsExecutionEnv: process.env.AWS_EXECUTION_ENV
  }
}

/**
 * クライアント接続テスト
 */
export async function testAWSConnections() {
  const diagnostics = getEnvironmentDiagnostics()
  logger.info('AWS環境診断:', diagnostics)
  
  const results = {
    cognito: false,
    dynamodb: false,
    s3: false,
    diagnostics
  }
  
  // Cognito接続テスト
  try {
    const cognitoClient = createCognitoClient()
    // 簡単なAPIコールでテスト（実際のリクエストは行わない）
    results.cognito = true
  } catch (error) {
    logger.error('Cognitoクライアント作成に失敗しました:', error)
  }
  
  // DynamoDB接続テスト
  try {
    const dynamoClient = createDynamoDBDocumentClient()
    // クライアント作成が成功すればOK
    results.dynamodb = true
  } catch (error) {
    logger.error('DynamoDBクライアント作成に失敗しました:', error)
  }
  
  // S3接続テスト
  try {
    const s3Client = createS3Client()
    // クライアント作成が成功すればOK
    results.s3 = true
  } catch (error) {
    logger.error('S3クライアント作成に失敗しました:', error)
  }
  
  return results
}