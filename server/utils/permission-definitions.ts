/**
 * 権限定義の中央管理
 */

export interface PermissionCategory {
  label: string
  level: 'user' | 'admin'  // 権限レベルを追加
  permissions: Array<{
    key: string
    label: string
    description: string
  }>
}

export interface PermissionDefinition {
  categories: Record<string, PermissionCategory>
  allPermissions: Array<{
    key: string
    label: string
    description: string
  }>
}

/**
 * システム権限の定義
 */
export const PERMISSION_DEFINITIONS: PermissionDefinition = {
  categories: {
    profile: {
      label: 'プロフィール',
      level: 'user',
      permissions: [
        { key: 'profile:read', label: 'プロフィール閲覧', description: 'プロフィール情報の参照' },
        { key: 'profile:update', label: 'プロフィール編集', description: 'プロフィール情報の編集' }
      ]
    },
    dashboard: {
      label: 'ダッシュボード',
      level: 'user',
      permissions: [
        { key: 'dashboard:access', label: 'ダッシュボードアクセス', description: 'ダッシュボードの利用' }
      ]
    },
    transaction_user: {
      label: '取引（ユーザー）',
      level: 'user',
      permissions: [
        { key: 'transaction:read', label: '取引閲覧', description: '自分の取引履歴の参照' },
        { key: 'transaction:request', label: '取引申請', description: '取引の申請・リクエスト' }
      ]
    },
    account_user: {
      label: 'アカウント',
      level: 'user',
      permissions: [
        { key: 'account:create-sub', label: 'サブアカウント作成', description: '自身に紐づくサブアカウントの作成' }
      ]
    },
    market_rate_user: {
      label: '市場レート（閲覧）',
      level: 'user',
      permissions: [
        { key: 'market_rate:read', label: 'レート閲覧', description: '市場レート情報の参照' }
      ]
    },
    admin: {
      label: '管理者機能',
      level: 'admin',
      permissions: [
        { key: 'admin:access', label: '管理者アクセス', description: '管理者機能へのアクセス' }
      ]
    },
    user: {
      label: 'ユーザー管理',
      level: 'admin',
      permissions: [
        { key: 'user:create', label: 'ユーザー作成', description: 'ユーザーアカウントの作成' },
        { key: 'user:read', label: 'ユーザー閲覧', description: 'ユーザー情報の参照' },
        { key: 'user:update', label: 'ユーザー編集', description: 'ユーザー情報の編集' },
        { key: 'user:delete', label: 'ユーザー削除', description: 'ユーザーアカウントの削除' },
        { key: 'profile:approve', label: 'プロフィール承認', description: 'ユーザープロフィール変更の承認・拒否' }
      ]
    },
    group: {
      label: 'グループ管理',
      level: 'admin',
      permissions: [
        { key: 'group:create', label: 'グループ作成', description: 'ユーザーグループの作成' },
        { key: 'group:read', label: 'グループ閲覧', description: 'グループ情報の参照' },
        { key: 'group:update', label: 'グループ編集', description: 'グループ情報の編集' },
        { key: 'group:delete', label: 'グループ削除', description: 'グループの削除' }
      ]
    },
    transaction_admin: {
      label: '取引管理',
      level: 'admin',
      permissions: [
        { key: 'admin:transaction:read', label: '全取引閲覧', description: '全ユーザーの取引履歴の参照' },
        { key: 'transaction:create', label: '取引作成', description: '取引の作成・管理' },
        { key: 'transaction:approve', label: '取引承認', description: '取引の承認・拒否' }
      ]
    },
    market_rate_admin: {
      label: '市場レート管理',
      level: 'admin',
      permissions: [
        { key: 'market_rate:create', label: 'レート作成', description: '市場レートの作成・更新' }
      ]
    },
    batch_operations: {
      label: '一括調整',
      level: 'admin',
      permissions: [
        { key: 'batch:execute', label: '一括調整実行', description: '残高の一括調整実行' },
        { key: 'batch:read', label: '一括調整閲覧', description: '一括調整履歴の閲覧' }
      ]
    },
    segment: {
      label: 'セグメント管理',
      level: 'admin',
      permissions: [
        { key: 'segment:create', label: 'セグメント作成', description: '運用セグメントの作成' },
        { key: 'segment:read', label: 'セグメント閲覧', description: '運用セグメント情報・所属ユーザーの参照' },
        { key: 'segment:update', label: 'セグメント編集', description: '運用セグメント情報・所属ユーザーの編集' },
        { key: 'segment:delete', label: 'セグメント削除', description: '運用セグメントの削除' }
      ]
    },
    invite: {
      label: '招待コード管理',
      level: 'admin',
      permissions: [
        { key: 'invite:create', label: '招待コード発行', description: '新規登録用の招待コード発行' },
        { key: 'invite:read', label: '招待コード閲覧', description: '招待コード一覧の参照' },
        { key: 'invite:revoke', label: '招待コード失効', description: '招待コードの失効' }
      ]
    }
  },
  get allPermissions() {
    return Object.values(this.categories).flatMap(category => category.permissions)
  }
}

/**
 * デフォルトグループの権限設定
 */
export const DEFAULT_GROUP_PERMISSIONS = {
  get administrator() {
    // administratorは全ての権限を持つ
    return PERMISSION_DEFINITIONS.allPermissions.map(p => p.key)
  },
  user: [
    'profile:read', 'profile:update', 'transaction:read', 'transaction:request', 'dashboard:access', 'market_rate:read', 'account:create-sub'
  ]
}

/**
 * 権限キーの一覧を取得
 */
export function getAllPermissionKeys(): string[] {
  return PERMISSION_DEFINITIONS.allPermissions.map(p => p.key)
}

/**
 * レベル別の権限カテゴリを取得
 */
export function getPermissionsByLevel(level: 'user' | 'admin') {
  return Object.fromEntries(
    Object.entries(PERMISSION_DEFINITIONS.categories).filter(([_, category]) => category.level === level)
  )
}

/**
 * デフォルト権限テンプレートを取得
 */
export function getDefaultPermissionTemplates() {
  return {
    basicUser: Object.values(getPermissionsByLevel('user')).flatMap(category => 
      category.permissions.map(p => p.key)
    ),
    powerUser: [
      ...Object.values(getPermissionsByLevel('user')).flatMap(category => 
        category.permissions.map(p => p.key)
      ),
      'transaction:approve' // ユーザー権限 + 取引承認
    ],
    manager: [
      ...Object.values(getPermissionsByLevel('user')).flatMap(category => 
        category.permissions.map(p => p.key)
      ),
      'user:read', 'user:update', 'group:read', 'transaction:approve'
    ]
  }
}

/**
 * 権限の妥当性をチェック
 */
export function validatePermissions(permissions: string[]): { valid: string[], invalid: string[] } {
  const validPermissions = getAllPermissionKeys()
  const valid = permissions.filter(p => validPermissions.includes(p))
  const invalid = permissions.filter(p => !validPermissions.includes(p))
  
  return { valid, invalid }
}