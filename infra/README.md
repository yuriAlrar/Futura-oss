# Futura インフラストラクチャ

このディレクトリには、FuturaアプリケーションのAWSインフラストラクチャを管理するTerraform設定ファイルが含まれています。

> **実際のデプロイ手順は [doc/guides/deployment_runbook.md](../doc/guides/deployment_runbook.md) を参照してください。**
> 本ドキュメントはリソース一覧・変数・トラブルシューティングのリファレンスです。

## ディレクトリ構成

```
infra/
├── main.tf                      # メインのTerraform設定
├── backend.tf                   # S3リモートバックエンド設定
├── variables.tf                 # 入力変数定義
├── outputs.tf                   # 出力値定義
├── terraform.tfvars.example     # 変数ファイルのサンプル
├── buildspec.yml                # AWS CodeBuild用ビルド設定
├── cloudshell.sh                # CloudShellからのデプロイスクリプト（推奨）
├── setup-backend.sh             # Terraform Stateバケット作成（アカウント初回のみ）
├── deploy.sh                    # ローカルデプロイスクリプト（非推奨・下記注意）
├── cognito/                     # Cognito User Pool設定
├── dynamodb/                    # DynamoDBテーブル設定
├── s3/                          # S3バケット設定
├── iam/                         # IAMロールとポリシー設定
├── lambda/                      # Lambda関数設定
└── docs/
    └── CODEBUILD_SETUP.md       # CodeBuildセットアップガイド
```

## 前提条件

1. **AWS CLI** がインストールされ、適切な認証情報で設定されていること
2. **Terraform** (>= 1.0) がインストールされていること
3. 以下のAWSリソースに対する適切な権限:
   - Amazon Cognito
   - Amazon DynamoDB
   - Amazon S3
   - AWS IAM
   - AWS Lambda
   - Amazon CloudWatch

## デプロイ方法

このプロジェクトは2つのデプロイ方法をサポートしています。

### オプション1: ローカル環境からのデプロイ

開発環境や初回セットアップ時に適しています。

#### 手順

1. **サンプル変数ファイルをコピー**:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **`terraform.tfvars` を編集**:
   ```hcl
   aws_region   = "us-east-1"
   environment  = "dev"          # dev, stg, prod のいずれか
   project_name = "futura"

   # オプション: S3バケット名をカスタマイズ（グローバルにユニークである必要があります）
   # uploads_bucket_name = "my-company-futura-dev-uploads-unique-123"
   ```

3. **Terraform Stateバケットをセットアップ** (アカウントで初回のみ):
   ```bash
   ./setup-backend.sh
   ```

   このスクリプトは以下を実行します:
   - S3バケットの作成(暗号化、バージョニング有効)
   - `backend.hcl` ファイルの生成

   > ⚠️ **既にstateバケットがある場合は実行しないでください。**
   > バケット名を `date +%s` から生成するため、実行するたびに別名の新しいバケットを作ります。
   > 既存バケットがあるのに実行すると、空のstateを掴んだTerraformが「まだ何も作られていない」と
   > 誤認し、apply時に既存リソースと衝突するか二重作成します。
   > 2つ目以降の環境では、既存バケットを使い `key` だけを
   > `futura/{環境名}/terraform.tfstate` に変えた `backend.hcl` を手書きしてください。

4. **Terraformを初期化**:
   ```bash
   terraform init -backend-config=backend.hcl
   ```

5. **デプロイ計画を確認**:
   ```bash
   terraform plan
   ```

6. **インフラストラクチャをデプロイ**:
   ```bash
   terraform apply
   ```

#### 簡単デプロイ

すべての手順を自動化したスクリプトも用意しています:

```bash
./deploy.sh
```

このスクリプトは以下を実行します:
- AWS認証確認
- Terraform バージョンチェック
- backend.hcl の存在確認(なければ setup-backend.sh を実行)
- terraform.tfvars の存在確認
- Terraform init, plan, apply の実行

### オプション2: AWS CodeBuildからのデプロイ (推奨)

本番環境やチーム開発で推奨される方法です。AWS CodeBuildを使用することで、一貫性のあるデプロイ環境を実現できます。

#### 特徴

- ✅ ローカル環境に依存しない一貫したデプロイ
- ✅ 環境変数による柔軟な環境管理(dev/stg/prod)
- ✅ AWSマネージドな実行環境
- ✅ CloudWatch Logsによるデプロイログの保存

#### セットアップ手順

1. **Terraform Stateバケットを作成** (初回のみ):
   ```bash
   cd infra
   ./setup-backend.sh
   ```

   生成された `backend.hcl` 内のバケット名をメモしてください。

2. **CodeBuildプロジェクトを作成**し、以下の環境変数を設定:

   | 環境変数名 | 値の例 | 説明 |
   |-----------|--------|------|
   | `ENVIRONMENT` | `dev` | デプロイ環境 (dev/stg/prod) |
   | `AWS_REGION` | `us-east-1` | AWSリージョン |
   | `PROJECT_NAME` | `futura` | プロジェクト名 |
   | `TF_STATE_BUCKET` | `futura-terraform-state-...` | setup-backend.shで作成したバケット名 |

3. **CodeBuildからビルドを実行**

詳細な手順は **[CodeBuildセットアップガイド](docs/CODEBUILD_SETUP.md)** を参照してください。

## 作成されるAWSリソース

| リソース | 説明 | 用途 |
|---------|------|------|
| **Cognito User Pool** | ユーザー認証・認可 | ユーザー管理、JWT発行 |
| **DynamoDB テーブル (9個)** | NoSQLデータベース | ユーザー、取引、市場レート、セッション、権限、一括操作、セグメント、ユーザーセグメント、招待コード |
| **S3 バケット** | オブジェクトストレージ | プロフィール画像などのファイル保存 |
| **IAM ロール/ポリシー** | 権限管理 | Lambda実行ロール、アクセス制御 |
| **Lambda 関数** | サーバーレス関数 | プレースホルダー(将来の拡張用) |
| **CloudWatch ロググループ** | ログ管理 | アプリケーションログの保存 |

### DynamoDBテーブル詳細

1. **users**: ユーザープロフィール情報
2. **transactions**: 入出金・資産運用の取引履歴
3. **market_rates**: 相場価格データ（現在は1BTC=1JPY固定運用）
4. **sessions**: セッション管理
5. **permissions**: ユーザー権限管理
6. **batch_operations**: 一括資産調整の実行履歴
7. **segments**: 運用セグメントのマスタ
8. **user_segments**: ユーザーとセグメントの紐付け
9. **invites**: 招待制登録用の招待コード

すべてのテーブルでポイントインタイムリカバリ(PITR)が有効化されています。

## 重要な注意事項

- 初期管理者ユーザーは以下の認証情報で作成されます:
  - メールアドレス: `admin@example.com`
  - 初期パスワード: `TempAdmin123!`
  - **⚠️ デプロイ後、必ずパスワードを変更してください**

- すべてのリソースに環境とプロジェクト情報のタグが付与されます

- S3バケットはプライベート設定で、バージョニングが有効化されています

- Lambda関数は現在プレースホルダーです(実際のデプロイはNuxtサーバーで実行)

### S3バケット名のカスタマイズ

S3バケット名は**全世界でユニーク**である必要があります。他のAWSアカウントで同じバケット名が使用されている場合、デプロイが失敗します。

**デフォルトの命名規則**:
```
{project_name}-{environment}-uploads
例: futura-dev-uploads
```

**カスタマイズ方法**:

1. **Terraformの場合**（`terraform.tfvars`）:
   ```hcl
   uploads_bucket_name = "your-company-futura-dev-uploads-unique-identifier"
   ```

2. **`.env.{環境名}` の `NUXT_S3_UPLOADS_BUCKET`**（推奨。`cloudshell.sh` / `buildspec.yml` の
   いずれもこの値を読み取ってTerraformへ渡すため、アプリとの食い違いが起きない）:
   ```
   NUXT_S3_UPLOADS_BUCKET=futura-dev-uploads-xxxxxx
   ```

**推奨される命名規則**:
- 会社名やチーム名のプレフィックスを追加: `acme-futura-dev-uploads`
- AWSアカウントIDのサフィックスを追加: `futura-dev-uploads-123456789012`
- ランダムな識別子を追加: `futura-dev-uploads-a1b2c3d4`

## デプロイ後の設定

デプロイが完了したら、以下の出力値をNuxtアプリケーションの環境変数に設定してください。

### ⚠️ Amplify SSR Compute roleの割り当て（必須・環境構築時に毎回必要）

`server/api/**`はAmplify Hosting Compute上で動作するため、DynamoDB/Cognitoへのアクセスには専用のIAMロール（Compute role）が必要です。このロールは本モジュール（`amplify_ssr_compute`）で作成されますが、**Amplify App自体はTerraform管理外のため、Amplifyコンソール側での紐付けを手動で行う必要があります**。これを忘れるとログイン処理が`Could not load credentials from any providers`エラーで失敗します。

```bash
terraform output amplify_ssr_compute_role_arn
```

Amplifyコンソール → 対象アプリ →「App settings」→「IAM roles」→「Compute role」→ 上記ロールを選択して保存。詳細は[deployment_runbook.md](../doc/guides/deployment_runbook.md#e-amplifyアプリの作成)を参照。

### 出力値の確認

```bash
terraform output
```

### Nuxtアプリケーションへの設定

`.env` ファイルまたは環境変数に以下を設定:

```bash
# Cognito設定
NUXT_PUBLIC_COGNITO_USER_POOL_ID="<cognito_user_pool_id の値>"
NUXT_PUBLIC_COGNITO_CLIENT_ID="<cognito_user_pool_client_id の値>"
NUXT_PUBLIC_COGNITO_REGION="us-east-1"

# S3設定
NUXT_S3_BUCKET_NAME="<s3_bucket_name の値>"

# DynamoDB設定
NUXT_DYNAMODB_TABLE_PREFIX="futura-dev"  # environment に応じて変更
```

## テストアカウント

デプロイ後、以下のテストアカウントが利用可能です:

| 役割 | メールアドレス | 初期パスワード | 権限 |
|-----|--------------|--------------|------|
| 管理者 | admin@example.com | TempAdmin123! | フルアクセス |
| 一般ユーザー | user@example.com | TempUser123! | 読み取り専用 |

**⚠️ セキュリティ注意**: 本番環境では必ず以下を実施してください:
1. 初期パスワードの変更
2. MFAの有効化
3. テストアカウントの削除または無効化

## トラブルシューティング

### エラー: Backend configuration not found

```
Error: Backend initialization required
```

**解決方法**: `./setup-backend.sh` を実行してStateバケットを作成してください。

### エラー: Invalid credentials

```
Error: error configuring Terraform AWS Provider: no valid credential sources
```

**解決方法**: AWS CLIの設定を確認してください:
```bash
aws configure
aws sts get-caller-identity
```

### エラー: Resource already exists

```
Error: error creating DynamoDB Table: ResourceInUseException
```

**解決方法**: 既存のリソースをインポートするか、別の環境名を使用してください:
```bash
# 既存リソースのインポート
./import-resources.sh

# または別の環境名を使用
export ENVIRONMENT="dev2"
```

## リソースの削除

**⚠️ 警告**: このコマンドはすべてのリソースとデータを**完全に削除**します。

```bash
terraform destroy
```

削除前に必ず以下を確認してください:
1. 重要なデータのバックアップ
2. 削除対象リソースの確認
3. 本番環境でないことの確認

## セキュリティのベストプラクティス

1. **認証情報の管理**
   - `backend.hcl` と `terraform.tfvars` は `.gitignore` に含まれています
   - これらのファイルは**絶対にGitにコミットしないでください**

2. **最小権限の原則**
   - IAMロールには必要最小限の権限のみを付与

3. **暗号化**
   - S3バケット: サーバーサイド暗号化(AES-256)
   - DynamoDB: 保管時の暗号化有効
   - Terraform State: S3バケット暗号化

4. **監査とログ**
   - CloudWatch Logsでアプリケーションログを管理
   - DynamoDBのPITRで35日間のバックアップ

5. **環境分離**
   - 本番/ステージング/開発環境は別々のAWSアカウントまたはリージョンで管理することを推奨

## 関連ドキュメント

- [CodeBuildセットアップガイド](docs/CODEBUILD_SETUP.md) - AWS CodeBuildでの自動デプロイ設定
- [CLAUDE.md](../CLAUDE.md) - プロジェクト全体のアーキテクチャとガイドライン
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [AWS Cognito](https://docs.aws.amazon.com/cognito/)
- [Amazon DynamoDB](https://docs.aws.amazon.com/dynamodb/)

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
