# 🚀 M・S CFD App - インフラ構築ガイド

## 📋 **構築前の準備**

### 1. AWS認証設定
```bash
# AWS CLIの設定
aws configure

# または環境変数で設定
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"
```

### 2. 必要な権限
以下のAWS権限が必要です：
- **S3**: CreateBucket, PutObject, GetObject
- **DynamoDB**: CreateTable, PutItem, GetItem
- **Cognito**: CreateUserPool, CreateUser, CreateGroup
- **IAM**: CreateRole, CreatePolicy, AttachPolicy
- **Lambda**: CreateFunction, UpdateFunctionCode

## 🚀 **自動デプロイ実行**

### ワンコマンドデプロイ
```bash
# インフラディレクトリに移動
cd infra

# 自動デプロイ実行
./deploy.sh
```

### 手動ステップ実行
```bash
# 1. バックエンド設定（初回のみ）
./setup-backend.sh

# 2. Terraform初期化
terraform init -backend-config=backend.hcl

# 3. プラン確認
terraform plan

# 4. 実行
terraform apply
```

## 📊 **構築される環境**

### AWS リソース
- **Cognito User Pool**: ユーザー認証
  - Administrator グループ
  - 管理者ユーザー: `admin@example.com`
  - テストユーザー: `user@example.com`
- **DynamoDB テーブル**: 
  - users, transactions, market_rates, sessions, permissions
- **S3 バケット**: ファイルアップロード用 + Terraformステート管理
- **IAM ロール**: Lambda実行用
- **Lambda**: 将来の拡張用

### 初期アカウント
| ユーザー | メール | パスワード | 権限 |
|---------|-------|-----------|------|
| 管理者 | admin@example.com | TempAdmin123! | administrator |
| テスト | user@example.com | TempUser123! | 一般ユーザー |

## 🔧 **デプロイ後の設定**

### 1. Nuxt環境変数設定
```bash
# プロジェクトルートに .env ファイル作成
NUXT_PUBLIC_COGNITO_USER_POOL_ID=<terraform_output_value>
NUXT_PUBLIC_COGNITO_CLIENT_ID=<terraform_output_value>
AWS_REGION=us-east-1
```

### 2. Terraform出力値の確認
```bash
terraform output
```

### 3. アプリケーション起動
```bash
# プロジェクトルートで
npm install
npm run dev
```

## 🗑️ **リソース削除**

### 全リソース削除
```bash
terraform destroy
```

### バックエンド削除（オプション）
```bash
# S3バケットも削除する場合
aws s3 rb s3://your-terraform-state-bucket --force
```

## ⚠️ **注意事項**

### セキュリティ
- `backend.hcl`にはセンシティブ情報が含まれるため、git管理しない
- 本番環境では適切なIAM権限とMFA設定を推奨
- 初期パスワードは必ず変更する

### コスト管理
- DynamoDBは従量課金（PAY_PER_REQUEST）
- S3は使用量に応じた課金（stateファイルは微小）
- Cognitoは月間アクティブユーザー数に応じた課金

### トラブルシューティング
- AWS認証エラー: `aws sts get-caller-identity`で確認
- バケット名重複: setup-backend.shが自動で一意名生成
- 権限不足: IAMユーザーの権限設定を確認

## 📞 **サポート**

エラーが発生した場合：
1. AWS認証情報の確認
2. 必要権限の確認
3. リージョン設定の確認（us-east-1）
4. terraform.log でデバッグ情報確認