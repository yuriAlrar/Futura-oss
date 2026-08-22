// User types
export interface User {
  user_id: string
  email: string
  name: string
  address: string
  phone_number: string
  status: 'active' | 'suspended' | 'deleted'
  profile_image_url?: string
  profile_approved: boolean
  rejection_reason?: string
  btc_address: string
  created_at: string
  updated_at: string
  deleted_at?: string
  // サブアカウント関連: 本アカウントのuser_id（サブアカウントの場合のみ設定。本アカウント自身は未設定）
  parent_user_id?: string
  // 運用停止ステート（アカウントのログイン可否とは独立。一括操作の対象除外にのみ影響）
  operation_status?: 'active' | 'suspended'
}

// Transaction status constants
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const

export type TransactionStatus = typeof TRANSACTION_STATUS[keyof typeof TRANSACTION_STATUS]

// Transaction types
export interface Transaction {
  transaction_id: string
  user_id: string
  amount: number
  transaction_type: 'deposit' | 'withdrawal' | 'asset_management'
  timestamp: string
  created_by: string
  memo: string
  reason: string
  // 拡張フィールド
  status?: TransactionStatus  // 取引状態（既存データとの互換性のためオプショナル）
  requested_at?: string     // リクエスト作成日時（ISO 8601）
  processed_at?: string     // 承認/拒否処理日時（ISO 8601）
  processed_by?: string     // 処理者のuser_id
  rejection_reason?: string // 拒否理由（status='rejected'の場合）
  requested_jpy_amount?: number // リクエスト時点のJPY換算額スナップショット（将来のレート変動再開に備える）
}

// 拡張されたTransaction型（新機能で明示的に使用）
export interface EnhancedTransaction extends Transaction {
  status: TransactionStatus  // 必須フィールドとして再定義
}

// Market rate types
export interface MarketRate {
  rate_id: string
  timestamp: string
  btc_jpy_rate: number
  created_by: string
  created_at: string
  updated_at?: string
  updated_by?: string
}

// Session types
export interface Session {
  session_id: string               // UUIDv7
  user_id: string                  // Cognito user ID (sub)
  cognito_access_token: string     // Cognito access token
  cognito_id_token: string         // Cognito ID token
  cognito_refresh_token?: string   // Cognito refresh token (optional)
  ip_address: string               // Client IP address
  user_agent: string               // User agent string
  login_time: string               // ISO 8601 timestamp
  last_access_time: string         // ISO 8601 timestamp
  status: 'active' | 'expired' | 'revoked'
  expires_at: number               // Unix timestamp for DynamoDB TTL
  permissions?: string[]           // User permissions (cached)
  groups?: string[]                // User groups (cached)
}

export interface SessionCreateRequest {
  user_id: string
  cognito_access_token: string
  cognito_id_token: string
  cognito_refresh_token?: string
  ip_address: string
  user_agent: string
  permissions?: string[]           // User permissions (optional)
  groups?: string[]                // User groups (optional)
}

// Permission types
export interface Permission {
  group_name: string
  permissions: string[]
  description: string
  created_at: string
  updated_at: string
}

// Authentication types
export interface AuthUser {
  user_id: string
  email: string
  name: string
  groups: string[]
  permissions: string[]
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface ChangeInitialPasswordRequest {
  email: string
  temporaryPassword: string
  newPassword: string
  session: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// Dashboard types
export interface DashboardData {
  currentBalance: number
  currentValue: number
  depositPrincipal: number      // 入金元本（承認済み入金の合計）
  withdrawalTotal: number       // 出金額（承認済み出金の合計、絶対値）
  creditBonus: number           // クレジットボーナス（承認済み、reason='クレジットボーナス'）
  netProfit: number             // 純利益（現在残高 - 入金元本 + 出金額）
  balanceHistory: BalanceHistoryItem[]
  recentTransactions: Transaction[]
}

export interface BalanceHistoryItem {
  date: string
  btc_amount: number
  jpy_value: number
  btc_rate: number
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// Form types
export interface UserCreateForm {
  email: string
  name: string
  address: string
  phone_number: string
  temporary_password: string
}

export interface UserUpdateForm {
  name?: string
  address?: string
  phone_number?: string
}

export interface TransactionCreateForm {
  user_id: string
  amount: number
  transaction_type: 'deposit' | 'withdrawal'
  memo: string
  reason: string
}

export interface TransactionRequestForm {
  amount: number
  transaction_type: 'deposit' | 'withdrawal'
  memo?: string
  reason: string
}

export interface TransactionApprovalForm {
  status: typeof TRANSACTION_STATUS.APPROVED | typeof TRANSACTION_STATUS.REJECTED
  rejection_reason?: string
}

export interface MarketRateCreateForm {
  timestamp: string
  btc_jpy_rate: number
}

export interface MarketRateUpdateForm {
  timestamp: string
  btc_jpy_rate: number
}

export interface MarketRateBulkCreateForm {
  rates: MarketRateCreateForm[]
}

export interface CSVUploadResponse {
  success: boolean
  created_count: number
  duplicates: MarketRateCreateForm[]
  errors: string[]
  message: string
}

// UI State types
export interface LoadingState {
  [key: string]: boolean
}

export interface NotificationState {
  show: boolean
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

// File upload types
export interface FileUpload {
  file: File
  preview?: string
  uploadProgress?: number
}

export interface UploadResponse {
  url: string
  key: string
}

// Cognito Group types
export interface CognitoGroup {
  GroupName: string
  UserPoolId: string
  Description?: string
  RoleArn?: string
  Precedence?: number
  LastModifiedDate?: Date
  CreationDate?: Date
}

export interface GroupCreateForm {
  groupName: string
  description?: string
  precedence?: number
  permissions?: string[]
}

export interface GroupUpdateForm {
  description?: string
  precedence?: number
  permissions?: string[]
}

export interface UserGroupMembership {
  userName: string
  groupName: string
  joinedDate?: Date
}

// Admin Group Management API types
export interface GroupManagementRequest {
  groupName: string
  description?: string
  precedence?: number
}

export interface UserGroupRequest {
  userId: string
  groupName: string
}

// Logger types
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface LoggerConfig {
  level?: LogLevel
  enableInProduction?: boolean
  prefix?: string
}

export interface Logger {
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  log: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
  success: (...args: any[]) => void
  trace: (...args: any[]) => void
  fatal: (...args: any[]) => void
  start: (...args: any[]) => void
  ready: (...args: any[]) => void
  fail: (...args: any[]) => void
  critical: (...args: any[]) => void
  setLevel: (level: LogLevel) => void
  getConfig: () => any
  withTag: (tag: string) => Logger
  auth: {
    login: (email: string) => void
    logout: (email: string) => void
    sessionValidation: (success: boolean, sessionId?: string) => void
    tokenVerification: (success: boolean) => void
  }
  api: {
    request: (method: string, path: string) => void
    response: (method: string, path: string, status: number) => void
    error: (method: string, path: string, error: any) => void
  }
  db: {
    query: (table: string, operation: string) => void
    error: (table: string, operation: string, error: any) => void
  }
  raw: any
}

// Admin Dashboard types
export interface DashboardTransactionRequest extends EnhancedTransaction {
  user_name: string
  user_email: string
}

export interface DashboardUser extends User {
  // ダッシュボード表示用の追加情報があれば定義
}

export interface AdminDashboardStats {
  pendingTransactionRequests: number
  pendingUsers: number
}

export interface RecentActivity {
  id: string
  type: 'transaction' | 'user_registration' | 'login'
  message: string
  timestamp: string
  user_name?: string
  user_email?: string
}

export interface AdminDashboardData {
  stats: AdminDashboardStats
  recentTransactionRequests: DashboardTransactionRequest[]
  pendingUsers: DashboardUser[]
  recentActivities: RecentActivity[]
}

// Batch operation types
export const BATCH_OPERATION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const

export type BatchOperationStatus = typeof BATCH_OPERATION_STATUS[keyof typeof BATCH_OPERATION_STATUS]

export interface BatchOperation {
  batch_id: string
  operation_type: 'btc_adjustment'
  adjustment_rate: number  // 増減率（%） 例: 5.0 = +5%, -3.0 = -3%
  target_user_count: number
  processed_user_count: number
  failed_user_count: number
  status: BatchOperationStatus
  created_by: string
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  memo?: string
  target_segment_id?: string // 対象を絞り込んだセグメントID（未指定の場合は全アクティブユーザーが対象）
}

export interface BatchOperationCreateForm {
  adjustment_rate: number
  memo?: string
  target_segment_id?: string // 未指定の場合は全アクティブユーザーが対象
}

export interface BatchOperationResult {
  batch_id: string
  status: BatchOperationStatus
  target_user_count: number
  processed_user_count: number
  failed_user_count: number
  errors?: Array<{
    user_id: string
    error: string
  }>
}

// ============================================================================
// セグメント（運用グループ）関連の型
// 権限のための「グループ」（Cognito管理）とは別概念。DynamoDBのみで管理する。
// ============================================================================

export interface Segment {
  segment_id: string
  name: string
  description?: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface SegmentCreateForm {
  name: string
  description?: string
}

export interface SegmentUpdateForm {
  name?: string
  description?: string
}

export interface SegmentWithMemberCount extends Segment {
  member_count: number
}

export interface UserSegmentMembership {
  segment_id: string
  user_id: string
  joined_at: string
}

// ============================================================================
// 招待制登録関連の型
// ============================================================================

export const INVITE_STATUS = {
  ACTIVE: 'active',
  CONSUMED: 'consumed',
  REVOKED: 'revoked'
} as const

export type InviteStatus = typeof INVITE_STATUS[keyof typeof INVITE_STATUS]

export interface Invite {
  invite_code: string
  status: InviteStatus
  created_by: string
  created_at: string
  consumed_by?: string
  consumed_at?: string
  revoked_at?: string
}

export interface PublicRegisterForm {
  invite_code: string
  email: string
  name: string
  phone_number: string
  password: string
}

// ============================================================================
// サブアカウント関連の型
// ============================================================================

export interface SubAccountCreateForm {
  email: string
  name: string
}

export interface SubAccountCreateResult {
  user: User
  temporary_password: string
}