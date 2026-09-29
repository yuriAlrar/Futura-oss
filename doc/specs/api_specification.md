# M・S CFD App - API仕様書

## 概要

BTC Mock Appのバックエンド API の詳細な仕様書です。すべてのエンドポイントの利用方法、リクエスト・レスポンス形式、認証要件を記載しています。

## 基本情報

- **ベースURL**: `/api`
- **データ形式**: JSON
- **認証**: Cookie認証 + AWS Cognito
- **認可**: Cognitoグループベースアクセス制御（administrator/user）

## 認証・認可

### 認証フロー
1. `/api/auth/login` でログイン → セッションCookie設定
2. 以降のリクエストで自動的にCookie認証
3. 権限が必要なエンドポイントでは追加で権限チェック

### 権限レベル
- **administrator**: 全ての操作が可能（Cognitoの`administrator`グループメンバー）
- **user**: 自身のデータの閲覧・更新のみ

### 管理者権限が必要なAPI
以下のAPIエンドポイントは`/api/admin/`以下に配置され、`administrator`グループのメンバーのみアクセス可能：
- ユーザー管理 (`/api/admin/users/`)
- グループ管理 (`/api/admin/groups/`)
- 取引作成 (`/api/admin/transactions/`)
- 取引リクエスト管理 (`/api/admin/transaction-requests/`, `/api/admin/transactions/[id]/status`)
- 相場価格設定 (`/api/admin/market-rates/`)
- セッション管理 (`/api/admin/sessions/`)
- システム診断 (`/api/admin/system/`)

---

## 1. 認証系API

### 1.1 ログイン

**エンドポイント**: `POST /api/auth/login`

**説明**: ユーザー認証を行い、セッションを開始します。

**リクエスト**:
```typescript
{
  email: string      // メールアドレス
  password: string   // パスワード
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    user_id: string
    email: string
    name: string
    groups: string[]      // ["administrator"] or [] など
    permissions: string[] // 権限一覧
  }
}
```

**エラーレスポンス**:
- `400`: メールアドレスまたはパスワードが未入力
- `401`: 認証情報が無効
- `500`: サーバーエラー

---

### 1.2 ログアウト

**エンドポイント**: `POST /api/auth/logout`

**説明**: ユーザーセッションを終了します。

**認証**: 必須

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

---

### 1.3 現在のユーザー情報取得

**エンドポイント**: `GET /api/auth/me`

**説明**: 認証中のユーザー情報を取得します。

**認証**: 必須

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    user_id: string
    email: string
    name: string
    groups: string[]
    permissions: string[]
  }
}
```

**エラーレスポンス**:
- `401`: 未認証

---

### 1.4 パスワード変更

**エンドポイント**: `POST /api/auth/change-password`

**説明**: 認証済みユーザーのパスワードを変更します。

**認証**: 必須

**リクエスト**:
```typescript
{
  currentPassword: string  // 現在のパスワード
  newPassword: string     // 新しいパスワード（8文字以上、小文字・数字含む）
}
```

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

**エラーレスポンス**:
- `400`: パスワード要件未満、現在のパスワードが間違っている
- `401`: 未認証

---

### 1.5 認証結果処理

**エンドポイント**: `POST /api/auth/process-auth-result`

**説明**: Cognito認証結果を処理し、セッションを作成します。

**リクエスト**:
```typescript
{
  authResult: {
    AccessToken: string
    IdToken: string
    RefreshToken?: string
  }
  email: string
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    user_id: string
    email: string
    name: string
    groups: string[]
    permissions: string[]
  }
}
```

---

## 2. ユーザー管理API

### 2.1 ユーザー一覧取得

**エンドポイント**: `GET /api/admin/users`

**説明**: ユーザー一覧を取得します（管理者のみ）。

**認証**: 必須
**権限**: `user:read`

**クエリパラメータ**:
- `page` (number, optional): ページ番号（default: 1）
- `limit` (number, optional): 1ページあたりの件数（default: 20, max: 100）
- `status` (string, optional): ユーザーステータスでフィルタ（active/suspended/all）

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    items: User[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }
}
```

**User型**:
```typescript
{
  user_id: string
  email: string
  name: string
  address: string
  phone_number: string
  status: "active" | "suspended" | "deleted"
  profile_image_url?: string
  profile_approved: boolean
  rejection_reason?: string
  btc_address: string
  created_at: string
  updated_at: string
}
```

---

### 2.2 ユーザー作成

**エンドポイント**: `POST /api/admin/users`

**説明**: 新規ユーザーを作成します（管理者のみ）。

**認証**: 必須
**権限**: `user:create`

**リクエスト**:
```typescript
{
  email: string           // メールアドレス
  name: string           // 氏名
  address: string        // 住所
  phone_number: string   // 電話番号
  temporary_password: string // 仮パスワード
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: User
  message: string
}
```

**エラーレスポンス**:
- `400`: 必須フィールド未入力、既存ユーザー
- `403`: 権限不足

---

### 2.3 ユーザー詳細取得

**エンドポイント**: `GET /api/admin/users/{userId}`

**説明**: 指定ユーザーの詳細情報を取得します。

**認証**: 必須
**権限**: `user:read`

**パスパラメータ**:
- `userId` (string): ユーザーID

**レスポンス**:
```typescript
{
  success: boolean
  data: User
}
```

---

### 2.4 ユーザープロフィール承認

**エンドポイント**: `POST /api/admin/users/{userId}/approve`

**説明**: 指定ユーザーのプロフィールを承認します。

**認証**: 必須
**権限**: `user:update`

**パスパラメータ**:
- `userId` (string): ユーザーID

**レスポンス**:
```typescript
{
  success: boolean
  data: User
  message: string
}
```

**エラーレスポンス**:
- `400`: ユーザーが削除済み、既に承認済み
- `404`: ユーザーが見つからない
- `403`: 権限不足

---

### 2.5 その他のユーザー管理アクション

以下のエンドポイントも同様の形式で実装されています（全て`administrator`グループメンバーのみアクセス可能）：

- `POST /api/admin/users/{userId}/suspend` - ユーザー停止
- `POST /api/admin/users/{userId}/reject` - プロフィール拒否
- `POST /api/admin/users/{userId}/activate` - ユーザー有効化
- `POST /api/admin/users/{userId}/delete` - ユーザー削除
- `POST /api/admin/users/{userId}/reset-password` - パスワードリセット
- `GET /api/admin/users/{userId}/balance` - ユーザー残高取得

---

## 3. Cognitoグループ管理API

### 3.1 グループ一覧取得

**エンドポイント**: `GET /api/admin/groups`

**説明**: 全てのCognitoグループを取得します（管理者のみ）。

**認証**: 必須
**権限**: `administrator`

**レスポンス**:
```typescript
{
  success: boolean
  data: CognitoGroup[]
  message: string
}
```

**CognitoGroup型**:
```typescript
{
  GroupName: string
  UserPoolId: string
  Description?: string
  RoleArn?: string
  Precedence?: number
  LastModifiedDate?: Date
  CreationDate?: Date
}
```

---

### 3.2 グループ作成

**エンドポイント**: `POST /api/admin/groups`

**説明**: 新しいCognitoグループを作成します（管理者のみ）。

**認証**: 必須
**権限**: `administrator`

**リクエスト**:
```typescript
{
  groupName: string      // グループ名（英数字、ハイフン、アンダースコアのみ）
  description?: string   // グループ説明
  precedence?: number    // 優先度
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: CognitoGroup
  message: string
}
```

**エラーレスポンス**:
- `400`: グループ名が無効、必須フィールド未入力
- `409`: 同名のグループが既に存在

---

### 3.3 グループ取得

**エンドポイント**: `GET /api/admin/groups/{groupName}`

**説明**: 指定されたCognitoグループの詳細を取得します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `groupName` (string): グループ名

**レスポンス**:
```typescript
{
  success: boolean
  data: CognitoGroup
  message: string
}
```

**エラーレスポンス**:
- `404`: グループが見つからない

---

### 3.4 グループ更新

**エンドポイント**: `PUT /api/admin/groups/{groupName}`

**説明**: 指定されたCognitoグループを更新します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `groupName` (string): グループ名

**リクエスト**:
```typescript
{
  description?: string   // グループ説明
  precedence?: number    // 優先度
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: CognitoGroup
  message: string
}
```

**エラーレスポンス**:
- `400`: 更新フィールドが未指定
- `404`: グループが見つからない

---

### 3.5 グループ削除

**エンドポイント**: `DELETE /api/admin/groups/{groupName}`

**説明**: 指定されたCognitoグループを削除します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `groupName` (string): グループ名

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

**エラーレスポンス**:
- `400`: administratorグループは削除不可
- `404`: グループが見つからない

---

### 3.6 グループのユーザー一覧取得

**エンドポイント**: `GET /api/admin/groups/{groupName}/users`

**説明**: 指定グループに所属するユーザー一覧を取得します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `groupName` (string): グループ名

**レスポンス**:
```typescript
{
  success: boolean
  data: string[]  // ユーザーIDの配列
  message: string
}
```

---

### 3.7 ユーザーのグループ取得

**エンドポイント**: `GET /api/admin/users/{userId}/groups`

**説明**: 指定ユーザーが所属するグループを取得します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `userId` (string): ユーザーID

**レスポンス**:
```typescript
{
  success: boolean
  data: string[]  // グループ名の配列
  message: string
}
```

---

### 3.8 ユーザーをグループに追加

**エンドポイント**: `POST /api/admin/users/{userId}/groups`

**説明**: 指定ユーザーをグループに追加します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `userId` (string): ユーザーID

**リクエスト**:
```typescript
{
  groupName: string  // 追加先グループ名
}
```

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

**エラーレスポンス**:
- `404`: ユーザーまたはグループが見つからない

---

### 3.9 ユーザーをグループから削除

**エンドポイント**: `DELETE /api/admin/users/{userId}/groups/{groupName}`

**説明**: 指定ユーザーをグループから削除します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `userId` (string): ユーザーID
- `groupName` (string): グループ名

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

**エラーレスポンス**:
- `404`: ユーザーまたはグループが見つからない

---

## 4. セッション管理API

### 4.1 セッション一覧取得

**エンドポイント**: `GET /api/admin/sessions`

**説明**: 全ユーザーのセッション一覧を取得します（管理者のみ）。

**認証**: 必須
**権限**: `administrator`

**クエリパラメータ**:
- `status` (string, optional): セッションステータス（active/expired/revoked）
- `limit` (number, optional): 取得件数制限

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    sessions: Session[]
    totalCount: number
    activeCount: number
  }
  message: string
}
```

**Session型**:
```typescript
{
  session_id: string
  user_id: string
  login_time: string
  last_access_time: string
  ip_address: string
  user_agent: string
  status: "active" | "expired" | "revoked"
  expires_at: number
  // セキュリティ上、トークンは[REDACTED]で表示
  cognito_access_token: string
  cognito_id_token: string
  cognito_refresh_token?: string
}
```

---

### 4.2 セッション削除

**エンドポイント**: `DELETE /api/admin/sessions/{sessionId}`

**説明**: 指定セッションを削除します（管理者のみ）。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `sessionId` (string): セッションID

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

---

### 4.3 ユーザーセッション取得

**エンドポイント**: `GET /api/admin/users/{userId}/sessions`

**説明**: 指定ユーザーのセッション一覧を取得します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `userId` (string): ユーザーID

**レスポンス**:
```typescript
{
  success: boolean
  data: Session[]
  message: string
}
```

---

### 4.4 ユーザーセッション全削除

**エンドポイント**: `DELETE /api/admin/users/{userId}/sessions`

**説明**: 指定ユーザーの全セッションを削除します。

**認証**: 必須
**権限**: `administrator`

**パスパラメータ**:
- `userId` (string): ユーザーID

**レスポンス**:
```typescript
{
  success: boolean
  message: string
}
```

---

## 5. システム診断API

### 5.1 システム診断取得

**エンドポイント**: `GET /api/admin/system/diagnostics`

**説明**: システムの動作状況を診断します（管理者のみ）。

**認証**: 必須
**権限**: `administrator`

**クエリパラメータ**:
- `test` (string, optional): "true"を指定すると接続テストも実行

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    diagnostics: {
      nodeVersion: string
      environment: string
      region: string
      tableNames: string[]
    }
    connectionTest?: {
      dynamodb: boolean
      cognito: boolean
      s3: boolean
    }
    timestamp: string
  }
  message: string
}
```

---

## 6. 取引管理API

### 6.1 取引履歴取得

**エンドポイント**: `GET /api/transactions`

**説明**: 取引履歴を取得します。ユーザーは自分の取引のみ、管理者は全ての取引を閲覧可能。

**認証**: 必須
**権限**: `transaction:read`

**クエリパラメータ**:
- `page` (number, optional): ページ番号
- `limit` (number, optional): 1ページあたりの件数
- `user_id` (string, optional): 特定ユーザーの取引のみ取得（管理者のみ）
- `transaction_type` (string, optional): 取引種別（deposit/withdrawal）

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    items: EnrichedTransaction[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }
}
```

**EnrichedTransaction型**:
```typescript
{
  transaction_id: string
  user_id: string
  amount: number
  transaction_type: "deposit" | "withdrawal"
  timestamp: string
  created_by: string
  memo: string
  reason: string
  user_name: string    // 追加情報
  user_email: string   // 追加情報
}
```

---

### 6.2 全取引履歴取得（管理者専用）

**エンドポイント**: `GET /api/admin/transactions`

**説明**: 管理者が全ユーザーの取引履歴を取得します。

**認証**: 必須
**権限**: `admin:transaction:read`

**クエリパラメータ**:
- `page` (number, optional): ページ番号
- `limit` (number, optional): 1ページあたりの件数
- `user_id` (string, optional): 特定ユーザーの取引のみ取得
- `transaction_type` (string, optional): 取引種別（deposit/withdrawal）

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    items: EnrichedTransaction[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }
}
```

**特徴**:
- 全ユーザーの取引履歴を取得可能
- ユーザー情報付きの拡張取引データ
- 管理者権限必須

---

### 6.3 取引作成

**エンドポイント**: `POST /api/admin/transactions`

**説明**: 新規取引を作成します（管理者のみ）。

**認証**: 必須
**権限**: `transaction:create`

**リクエスト**:
```typescript
{
  user_id: string                    // 対象ユーザーID
  amount: number                     // 取引金額（BTC）
  transaction_type: "deposit" | "withdrawal"
  memo: string                       // 取引メモ
  reason: string                     // 取引理由
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    ...Transaction
    user_name: string
    user_email: string
    new_balance: number  // 取引後の残高
  }
  message: string
}
```

**バリデーション**:
- `amount` > 0
- 出金時は残高チェック
- ユーザーが削除済みでないこと

---

### 6.4 入金リクエスト作成

**エンドポイント**: `POST /api/transactions/request`

**説明**: 一般ユーザーが入金リクエストを作成します。管理者による承認が必要です。

**認証**: 必須
**権限**: `transaction:request`

**リクエスト**:
```typescript
{
  amount: number     // 入金希望金額（BTC）
  memo?: string      // 取引メモ（任意）
  reason: string     // 入金理由
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    transaction_id: string
    user_id: string
    amount: number
    transaction_type: "deposit"
    status: "pending"
    requested_at: string
    memo: string
    reason: string
  }
  message: string
}
```

**バリデーション**:
- `amount` > 0 かつ ≤ 10 BTC（上限制限）
- 同じユーザーが承認待ちリクエストを複数持てない
- レート制限: 1日あたり最大50回のリクエスト（日付の区切りはJSTの0:00）

---

### 6.4 承認待ちリクエスト一覧取得

**エンドポイント**: `GET /api/admin/transaction-requests`

**説明**: 承認待ちの入金リクエスト一覧を取得します（管理者のみ）。

**認証**: 必須
**権限**: `transaction:approve`

**クエリパラメータ**:
- `status` (string, optional): リクエスト状態（pending/approved/rejected）デフォルト: pending
- `page` (number, optional): ページ番号
- `limit` (number, optional): 1ページあたりの件数

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    items: EnhancedTransactionRequest[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }
}
```

**EnhancedTransactionRequest型**:
```typescript
{
  transaction_id: string
  user_id: string
  user_name: string      // 追加情報
  user_email: string     // 追加情報
  amount: number
  transaction_type: "deposit"
  status: "pending" | "approved" | "rejected"
  requested_at: string
  processed_at?: string
  processed_by?: string
  memo: string
  reason: string
  rejection_reason?: string
}
```

---

### 6.5 リクエスト承認/拒否

**エンドポイント**: `PATCH /api/admin/transactions/[transaction_id]/status`

**説明**: 入金リクエストを承認または拒否します（管理者のみ）。

**認証**: 必須
**権限**: `transaction:approve`

**リクエスト**:
```typescript
{
  status: "approved" | "rejected"
  rejection_reason?: string  // status='rejected'の場合必須
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    transaction_id: string
    status: "approved" | "rejected"
    processed_at: string
    processed_by: string
    user_name: string
    user_email: string
    new_balance?: number    // 承認時のみ
    rejection_reason?: string
  }
  message: string
}
```

**バリデーション**:
- リクエストが`pending`状態であること
- 拒否時は`rejection_reason`が必須
- 二重処理の防止（楽観的ロック）

**業務ルール**:
- 承認時: ユーザーの残高に金額を加算
- 拒否時: 拒否理由を記録、残高は変更しない
- 処理後は状態変更を元に戻せない

---

## 7. 相場管理API

### 7.1 相場価格一覧取得

**エンドポイント**: `GET /api/market-rates`

**説明**: BTC相場価格の履歴を取得します。

**認証**: 必須
**権限**: `market_rate:read`

**クエリパラメータ**:
- `page` (number, optional): ページ番号
- `limit` (number, optional): 1ページあたりの件数（max: 100）

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    items: MarketRate[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }
}
```

**MarketRate型**:
```typescript
{
  rate_id: string
  timestamp: string
  btc_jpy_rate: number  // BTC/JPY相場価格
  created_by: string
  created_at: string
}
```

---

### 7.2 相場価格設定

**エンドポイント**: `POST /api/admin/market-rates`

**説明**: 新しいBTC相場価格を設定します（管理者のみ）。

**認証**: 必須
**権限**: `market_rate:create`

**リクエスト**:
```typescript
{
  timestamp: string    // 価格適用日時（ISO 8601）
  btc_jpy_rate: number // BTC/JPY価格（正の数）
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: MarketRate
  message: string
}
```

**動作**:
- 相場価格設定後、全ユーザーの資産価値を自動再計算

---

### 7.3 最新相場価格取得

**エンドポイント**: `GET /api/market-rates/latest`

**説明**: 最新のBTC相場価格を取得します。

**認証**: 不要

**レスポンス**:
```typescript
{
  success: boolean
  data: MarketRate | null
  message?: string
}
```

---

## 8. プロフィール管理API

### 8.1 プロフィール取得

**エンドポイント**: `GET /api/profile`

**説明**: 認証中ユーザーのプロフィールを取得します。

**認証**: 必須

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    user_id: string
    email: string
    name: string
    address: string
    phone_number: string
    btc_address: string
    profile_image_url?: string
    profile_approved: boolean
    status: string
    created_at: string
    updated_at: string
  }
}
```

---

### 8.2 プロフィール更新

**エンドポイント**: `PUT /api/profile`

**説明**: 認証中ユーザーのプロフィールを更新します。

**認証**: 必須

**リクエスト**:
```typescript
{
  name?: string         // 氏名
  address?: string      // 住所
  phone_number?: string // 電話番号
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: User
  message: string
}
```

---

## 9. ダッシュボードAPI

### 9.1 ダッシュボードデータ取得

**エンドポイント**: `GET /api/dashboard`

**説明**: ユーザーのダッシュボード表示用データを取得します。

**認証**: 必須

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    currentBalance: number       // 現在のBTC残高
    currentValue: number         // 現在の円建て価値
    balanceHistory: BalanceHistoryItem[]  // 過去30日の残高履歴
    recentTransactions: Transaction[]     // 最近の取引（最大10件）
  }
}
```

**BalanceHistoryItem型**:
```typescript
{
  date: string        // YYYY-MM-DD
  btc_amount: number  // その日のBTC残高
  jpy_value: number   // その日の円建て価値
  btc_rate: number    // その日のBTC/JPY相場
}
```

---

## 10. ファイルアップロードAPI

### 10.1 画像アップロード

**エンドポイント**: `POST /api/upload/image`

**説明**: プロフィール画像などをアップロードします。

**認証**: 必須

**リクエスト**: `application/json`
```typescript
{
  filename: string      // ファイル名（例: "profile.jpg"）
  contentType: string   // MIMEタイプ（例: "image/jpeg"）
  base64Data: string    // Base64エンコードされた画像データ
}
```

**レスポンス**:
```typescript
{
  success: boolean
  data: {
    url: string   // アップロードされた画像のURL
    key: string   // S3オブジェクトキー
  }
  message: string
}
```

**制限事項**:
- ファイル形式: JPEG, PNG のみ
- ファイルサイズ: 最大3MB（Base64エンコード前の実データサイズ）
- アップロード先: AWS S3プライベートバケット

---

## エラーハンドリング

### 標準エラーレスポンス

```typescript
{
  statusCode: number
  statusMessage: string
}
```

### HTTPステータスコード

- `200`: 成功
- `400`: バリデーションエラー、不正なリクエスト
- `401`: 未認証
- `403`: 権限不足
- `404`: リソースが見つからない
- `500`: サーバーエラー

### 認証エラー

認証が必要なエンドポイントで未認証の場合：

```typescript
{
  statusCode: 401,
  statusMessage: "Not authenticated"
}
```

### 権限エラー

権限が不足している場合：

```typescript
{
  statusCode: 403,
  statusMessage: "Permission denied"
}
```

---

## レート制限

現在、レート制限は実装されていませんが、本番環境では以下の制限を推奨：

- 認証API: 10回/分
- 一般API: 100回/分
- ファイルアップロード: 5回/分

---

## セキュリティ考慮事項

### 認証
- Cookie認証（HTTP-only, Secure, SameSite=Strict）
- AWS Cognito による認証基盤
- セッション有効期限: 24時間

### 認可
- 権限ベースアクセス制御
- 最小権限の原則
- 操作ログの記録

### データ保護
- HTTPS通信（本番環境）
- 入力値のバリデーション
- SQLインジェクション対策（DynamoDB使用）

---

## 開発・テスト

### 環境
- 開発: `http://localhost:3000/api`
- 本番: `https://your-domain.com/api`

### 認証テスト用アカウント
```
管理者（administratorグループメンバー）:
- email: admin@example.com
- password: TempPass123!

一般ユーザー:
- email: user@example.com  
- password: password123
```

**注意**: 管理者権限を使用するには、admin@example.comユーザーがCognitoの`administrator`グループに所属している必要があります。

---

**作成日**: 2024年1月28日  
**最終更新**: 2025年1月29日  
**バージョン**: 3.0  
**作成者**: システム開発チーム

**変更履歴**:
- v3.0 (2025/1/29): セッション管理・システム診断API追加、グループユーザー管理API追加、認証結果処理API追加
- v2.0 (2024/1/29): Cognitoグループ管理API追加、administrator権限システム実装
- v1.0 (2024/1/28): 初版作成