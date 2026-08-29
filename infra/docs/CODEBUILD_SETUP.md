# CodeBuild デプロイセットアップガイド

このガイドでは、AWS CodeBuildを使用してTerraformインフラストラクチャを自動デプロイする方法を説明します。

## 概要

CodeBuildを使用することで、ローカル環境からのデプロイではなく、AWS上で一貫性のあるデプロイを実現できます。

### アーキテクチャ

```
GitHub Repository
      ↓ (手動トリガー)
AWS CodeBuild
      ↓ (buildspec.yml実行)
Terraform Deployment
      ↓
AWS Resources (Cognito, DynamoDB, S3, etc.)
```

## 前提条件

- AWS CLIがインストールされ、適切な権限で設定されていること
- Terraformがローカルにインストールされていること(初回セットアップ用)
- GitHubリポジトリへのアクセス権があること

## セットアップ手順

### 1. Terraform Stateバケットの作成(初回のみ)

各環境(dev/staging/prod)ごとに、**ローカル環境で1回だけ**実行します。

```bash
cd infra

# 環境変数を設定
export AWS_REGION="us-east-1"
export PROJECT_NAME="futura"
export ENVIRONMENT="dev"  # または staging, prod

# Stateバケットを作成
./setup-backend.sh
```

このスクリプトは以下を実行します:
- S3バケット作成(暗号化、バージョニング有効)
- `backend.hcl` ファイル生成

**重要**: 生成された `backend.hcl` に記載されているバケット名をメモしてください。

例:
```hcl
bucket  = "futura-terraform-state-646223199816-ed154e80"
key     = "futura/dev/terraform.tfstate"
region  = "us-east-1"
encrypt = true
```

### 2. IAMサービスロールの作成

CodeBuildプロジェクト用のIAMロールを作成し、以下の権限を付与します。

#### 必須ポリシー

1. **AWSマネージドポリシー**:
   - `AmazonS3FullAccess` (Stateバケットとアプリ用S3バケット)
   - `CloudWatchLogsFullAccess` (ビルドログ)

2. **カスタムインラインポリシー**: `TerraformDeploymentPolicy`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:*",
        "cognito-idp:*",
        "iam:*",
        "lambda:*",
        "logs:*",
        "s3:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

**信頼関係**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "codebuild.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

ロール名例: `futura-codebuild-terraform-deploy-role`

### 3. CodeBuildプロジェクトの作成

AWS Management Consoleで各環境用のプロジェクトを作成します。

#### プロジェクト設定

**基本情報**:
- **プロジェクト名**: `futura-infra-deploy-dev` (環境ごとに変更)
- **説明**: `Terraform infrastructure deployment for dev environment`

**ソース**:
- **ソースプロバイダー**: GitHub
- **リポジトリ**: あなたのリポジトリを選択
- **ソースバージョン**: `main` (またはデプロイしたいブランチ)
- **Gitクローンの深さ**: 1

**環境**:
- **環境イメージ**: マネージド型イメージ
- **オペレーティングシステム**: Amazon Linux 2
- **ランタイム**: Standard
- **イメージ**: `aws/codebuild/amazonlinux2-x86_64-standard:5.0`
- **イメージのバージョン**: 常に最新のイメージ
- **特権付与**: いいえ
- **サービスロール**: 手順2で作成したロール

**環境変数** (重要):

| 名前 | 値 | タイプ |
|------|-----|--------|
| ENVIRONMENT | `dev` (または `staging`, `prod`) | プレーンテキスト |
| AWS_REGION | `us-east-1` | プレーンテキスト |
| PROJECT_NAME | `futura` | プレーンテキスト |
| TF_STATE_BUCKET | `futura-terraform-state-646223199816-ed154e80` | プレーンテキスト |

**Buildspec**:
- **ビルド仕様**: ビルド仕様ファイルを使用する
- **Buildspecファイル名**: `infra/buildspec.yml`

**Artifacts**:
- **タイプ**: アーティファクトなし (または必要に応じてS3)

**ログ**:
- **CloudWatch Logs**: 有効
- **ストリーム名**: `futura-deploy-logs`

#### 複数環境の管理

環境ごとにCodeBuildプロジェクトを作成します:

1. **開発環境**: `futura-infra-deploy-dev`
   - ENVIRONMENT=`dev`
   - TF_STATE_BUCKET=`futura-terraform-state-...-dev`

2. **ステージング環境**: `futura-infra-deploy-staging`
   - ENVIRONMENT=`staging`
   - TF_STATE_BUCKET=`futura-terraform-state-...-staging`

3. **本番環境**: `futura-infra-deploy-prod`
   - ENVIRONMENT=`prod`
   - TF_STATE_BUCKET=`futura-terraform-state-...-prod`

### 4. デプロイ実行

#### AWS Management Console から

1. CodeBuildコンソールを開く
2. 目的のプロジェクト(例: `futura-infra-deploy-dev`)を選択
3. **ビルドの開始**をクリック
4. ビルドログをモニタリング
5. 完了後、Outputsセクションで作成されたリソース情報を確認

#### AWS CLI から

```bash
# ビルド開始
aws codebuild start-build --project-name futura-infra-deploy-dev

# ビルドステータス確認
aws codebuild batch-get-builds --ids <build-id>
```

### 5. デプロイ後の確認

ビルドが成功すると、以下が表示されます:

```
📊 Infrastructure Outputs:
cognito_user_pool_id = "us-east-1_XXXXXXXXX"
cognito_user_pool_client_id = "XXXXXXXXXXXXXXXXXXXXXXXXXX"
s3_bucket_name = "futura-dev-uploads"
dynamodb_table_names = {...}
```

これらの値をNuxtアプリケーションの環境変数に設定してください。

## トラブルシューティング

### エラー: State bucket does not exist

```
❌ ERROR: Terraform State bucket 'futura-terraform-state-xxx' does not exist
```

**解決方法**: 手順1のStateバケット作成を実行してください。

### エラー: Missing required environment variables

```
❌ ERROR: Missing required environment variables
Required: ENVIRONMENT, AWS_REGION, PROJECT_NAME, TF_STATE_BUCKET
```

**解決方法**: CodeBuildプロジェクトの環境変数が正しく設定されているか確認してください。

### エラー: Permission denied

```
❌ ERROR: User is not authorized to perform: dynamodb:CreateTable
```

**解決方法**: IAMサービスロールに必要な権限が付与されているか確認してください。

### ビルドタイムアウト

デフォルトのタイムアウトは1時間です。Terraformの初回実行は時間がかかる場合があります。

**解決方法**: CodeBuildプロジェクトの設定で**タイムアウト**を延長してください。

## セキュリティのベストプラクティス

1. **最小権限の原則**: IAMロールには必要最小限の権限のみを付与
2. **Stateバケットの保護**:
   - パブリックアクセスブロック有効
   - バージョニング有効
   - 暗号化有効
3. **環境変数**: 機密情報は AWS Systems Manager Parameter Store または Secrets Manager を使用
4. **ブランチ保護**: 本番環境のプロジェクトは`main`ブランチからのみデプロイ

## 参考資料

- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [Terraform S3 Backend](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [ローカルデプロイ手順](../README.md)

## よくある質問

### Q: ローカルとCodeBuildで同じStateを共有できますか?

A: はい、同じTF_STATE_BUCKETを指定すれば可能です。ただし、同時実行による競合に注意してください。

### Q: ロールバックはどうすればいいですか?

A: Terraform Stateのバージョニングが有効なので、AWS S3コンソールから以前のバージョンに戻すことができます。

### Q: 手動承認ステップを追加できますか?

A: はい、`terraform plan`の後でビルドを一時停止する設定を追加できます。ただし、現在の構成は`-auto-approve`を使用しています。

### Q: 複数のAWSアカウントにデプロイできますか?

A: はい、環境ごとに異なるAWSアカウントを使用する場合は、各CodeBuildプロジェクトで異なるIAMロールを設定してください。
