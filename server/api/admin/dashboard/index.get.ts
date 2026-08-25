import { getDynamoDBService } from '~/server/utils/dynamodb'
import { useLogger } from '~/composables/useLogger'
import type { 
  EnhancedTransaction, 
  User, 
  AdminDashboardData,
  DashboardTransactionRequest,
  DashboardUser,
  RecentActivity
} from '~/types'
import { TRANSACTION_STATUS } from '~/types'

export default defineEventHandler(async (event) => {
  const logger = useLogger({ prefix: '[AdminDashboard]' })
  
  try {
    // 基本的な認証チェック - admin権限が必要
    const currentUser = await requirePermission(event, 'user:read')
    
    logger.info(`管理者ダッシュボードデータ取得開始: ${currentUser.user_id}`)
    
    const dynamodb = getDynamoDBService()
    const transactionsTableName = dynamodb.getTableName('transactions')
    const usersTableName = dynamodb.getTableName('users')
    const sessionsTableName = dynamodb.getTableName('sessions')
    
    // 並行して各データを取得
    const [
      pendingTransactionsResult,
      pendingUsersResult,
      totalPendingTransactionsResult,
      totalPendingUsersResult,
      recentApprovedTransactionsResult,
      recentUsersResult,
      recentSessionsResult
    ] = await Promise.all([
      // 最新の承認待ち入金リクエスト3件を取得
      dynamodb.query(
        transactionsTableName,
        '#status = :status',
        { ':status': TRANSACTION_STATUS.PENDING },
        {
          indexName: 'StatusIndex',
          expressionAttributeNames: { '#status': 'status' },
          scanIndexForward: false, // 最新順
          limit: 3
        }
      ),
      
      // 承認待ちユーザー3件を取得
      dynamodb.scan(
        usersTableName,
        {
          filterExpression: '#status = :status',
          expressionAttributeNames: { '#status': 'status' },
          expressionAttributeValues: { ':status': 'pending' },
          limit: 3
        }
      ),
      
      // 承認待ち入金リクエスト総数を取得
      dynamodb.query(
        transactionsTableName,
        '#status = :status',
        { ':status': TRANSACTION_STATUS.PENDING },
        {
          indexName: 'StatusIndex',
          expressionAttributeNames: { '#status': 'status' }
        }
      ),
      
      // 承認待ちユーザー総数を取得
      dynamodb.scan(
        usersTableName,
        {
          filterExpression: '#status = :status',
          expressionAttributeNames: { '#status': 'status' },
          expressionAttributeValues: { ':status': 'pending' }
        }
      ),
      
      // 最新の承認済み取引を取得（アクティビティ用）
      dynamodb.query(
        transactionsTableName,
        '#status = :status',
        { ':status': TRANSACTION_STATUS.APPROVED },
        {
          indexName: 'StatusIndex',
          expressionAttributeNames: { '#status': 'status' },
          scanIndexForward: false, // 最新順
          limit: 3
        }
      ),
      
      // 最新のユーザー登録を取得（アクティビティ用）
      dynamodb.scan(
        usersTableName,
        {
          filterExpression: '#status <> :deleted',
          expressionAttributeNames: { '#status': 'status' },
          expressionAttributeValues: { ':deleted': 'deleted' },
          limit: 50 // ソート用に多めに取得
        }
      ),
      
      // 最新のアクティブセッションを取得（アクティビティ用）
      dynamodb.scan(
        sessionsTableName,
        {
          filterExpression: '#status = :status',
          expressionAttributeNames: { '#status': 'status' },
          expressionAttributeValues: { ':status': 'active' },
          limit: 50 // ソート用に多めに取得
        }
      )
    ])
    
    const pendingTransactions = pendingTransactionsResult.items as EnhancedTransaction[]
    const pendingUsers = pendingUsersResult.items as User[]
    const recentApprovedTransactions = recentApprovedTransactionsResult.items as EnhancedTransaction[]
    const recentUsers = recentUsersResult.items as User[]
    const recentSessions = recentSessionsResult.items as any[]
    
    // 最近のアクティビティを生成
    const recentActivities: RecentActivity[] = []
    
    // 1. 最新の承認済み取引
    for (const transaction of recentApprovedTransactions.slice(0, 2)) {
      try {
        const user = await dynamodb.get(usersTableName, { user_id: transaction.user_id }) as User
        recentActivities.push({
          id: `transaction_${transaction.transaction_id}`,
          type: 'transaction',
          message: `${user?.name || 'Unknown User'}さんの${transaction.transaction_type === 'deposit' ? '入金' : '出金'}（¥${Math.round(Math.abs(transaction.amount)).toLocaleString('ja-JP')}）が承認されました`,
          timestamp: transaction.processed_at || transaction.timestamp,
          user_name: user?.name,
          user_email: user?.email
        })
      } catch (error) {
        logger.warn(`取引のユーザー情報取得に失敗: ${transaction.user_id}`, error)
      }
    }
    
    // 2. 最新のユーザー登録（作成日時順でソート）
    const sortedUsers = recentUsers
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 2)
    
    for (const user of sortedUsers) {
      recentActivities.push({
        id: `user_registration_${user.user_id}`,
        type: 'user_registration',
        message: `新しいユーザー「${user.name}」が登録されました`,
        timestamp: user.created_at,
        user_name: user.name,
        user_email: user.email
      })
    }
    
    // 3. 最新のログイン（ログイン時間順でソート）
    const sortedSessions = recentSessions
      .filter(session => session.login_time)
      .sort((a, b) => new Date(b.login_time).getTime() - new Date(a.login_time).getTime())
      .slice(0, 2)
    
    for (const session of sortedSessions) {
      try {
        const user = await dynamodb.get(usersTableName, { user_id: session.user_id }) as User
        recentActivities.push({
          id: `login_${session.session_id}`,
          type: 'login',
          message: `${user?.name || 'Unknown User'}さんがログインしました`,
          timestamp: session.login_time,
          user_name: user?.name,
          user_email: user?.email
        })
      } catch (error) {
        logger.warn(`セッションのユーザー情報取得に失敗: ${session.user_id}`, error)
      }
    }
    
    // 時系列でソートして最新5件を取得
    const sortedActivities = recentActivities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
    
    // 承認待ち取引のユーザー情報を取得
    let enhancedTransactionRequests: DashboardTransactionRequest[] = []
    
    // transaction:approve権限がある場合のみ入金リクエスト詳細を提供
    if (currentUser.permissions?.includes('transaction:approve')) {
      const userPromises = pendingTransactions.map(async (transaction) => {
        try {
          const user = await dynamodb.get(usersTableName, { user_id: transaction.user_id }) as User
          return {
            ...transaction,
            user_name: user?.name || 'Unknown User',
            user_email: user?.email || 'Unknown Email'
          } as DashboardTransactionRequest
        } catch (error) {
          logger.warn(`ユーザー情報取得に失敗: ${transaction.user_id}`, error)
          return {
            ...transaction,
            user_name: 'Unknown User',
            user_email: 'Unknown Email'
          } as DashboardTransactionRequest
        }
      })
      
      enhancedTransactionRequests = await Promise.all(userPromises)
    }
    
    // user:approve権限がない場合はユーザー一覧を制限
    let dashboardUsers: DashboardUser[] = []
    if (currentUser.permissions?.includes('user:approve')) {
      dashboardUsers = pendingUsers as DashboardUser[]
    }
    
    const dashboardData: AdminDashboardData = {
      stats: {
        pendingTransactionRequests: totalPendingTransactionsResult.items?.length || 0,
        pendingUsers: totalPendingUsersResult.items?.length || 0
      },
      recentTransactionRequests: enhancedTransactionRequests,
      pendingUsers: dashboardUsers,
      recentActivities: sortedActivities
    }
    
    logger.info(`管理者ダッシュボードデータ取得完了: stats=${JSON.stringify(dashboardData.stats)}, transactions=${enhancedTransactionRequests.length}件, users=${dashboardUsers.length}件`)
    
    return {
      success: true,
      data: dashboardData
    }
    
  } catch (error: unknown) {
    logger.error('管理者ダッシュボードデータ取得エラー:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch admin dashboard data'
    })
  }
})