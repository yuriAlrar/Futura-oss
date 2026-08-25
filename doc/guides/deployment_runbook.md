# デプロイ運用手順書

初期環境構築・インフラ構成変更・アプリケーションデプロイの一連の手順をまとめたrunbookです。個別の詳細は既存ドキュメントを参照しつつ、ここでは「何をどの順番で行うか」を一本化しています。

## 関連ドキュメント

- [infra/README.md](../../infra/README.md) — Terraformによるインフラ構築の詳細（リソース一覧、変数、トラブルシューティング）
- [infra/docs/CODEBUILD_SETUP.md](../../infra/docs/CODEBUILD_SETUP.md) — インフラデプロイ用CodeBuildプロジェクトのセットアップ詳細
- [database_specification.md](../specs/database_specification.md) — DynamoDBテーブル設計

## 全体構成

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  infra/ (Terraform)      │        │  アプリ本体 (Nuxt3)        │
│  - Cognito User Pool     │        │  - 静的アセット (SPA)       │
│  - DynamoDB (8テーブル)   │◄───────┤  - server/api/** (Compute) │
│  - S3 (アップロード)      │  参照   │                            │
│  - IAM                   │        │  AWS Amplify Hosting        │
│  Lambda(placeholder,未使用)│        │  (環境ごとに1アプリ)         │
└─────────────────────────┘        └──────────────────────────┘
        ↑ CodeBuild (環境ごとに1プロジェクト)     ↑ ブランチpushで自動デプロイ
   futura-infra-deploy-{dev|staging|prod}     futura-{dev|stg|prod} (Amplifyアプリ)
```

環境は **dev / stg / prod** の3系統。それぞれ独立したTerraform state・独立したAmplifyアプリを持つ（環境間でリソースは共有しない）。

## 1. 新規環境構築（初期構築）

新しい環境（例: 新規クライアント向けにdev一式を新設）を立ち上げる際の手順。**a〜gの順番で実施する。**

### a. Terraform Stateバケットの作成（環境ごとに初回のみ）

```bash
cd infra
export AWS_REGION="ap-northeast-1"
export PROJECT_NAME="futura"
export ENVIRONMENT="dev"   # dev / staging / prod
./setup-backend.sh
```

生成された`backend.hcl`のバケット名を控えておく（次のCodeBuild設定で使用）。詳細は[infra/README.md](../../infra/README.md#オプション2-aws-codebuildからのデプロイ-推奨)を参照。

### b. CodeBuildプロジェクトの作成（環境ごとに1つ）

[infra/docs/CODEBUILD_SETUP.md](../../infra/docs/CODEBUILD_SETUP.md)の手順に従い、`futura-infra-deploy-{dev|staging|prod}`を作成。buildspecは`infra/buildspec.yml`を指定。環境変数は以下を設定:

| 変数名 | 値 |
|---|---|
| `ENVIRONMENT` | `dev` / `staging` / `prod` |
| `AWS_REGION` | `ap-northeast-1` |
| `PROJECT_NAME` | `futura` |
| `TF_STATE_BUCKET` | aで作成したバケット名 |

### c. Terraformの実行とoutputsの確認

CodeBuildで「ビルドの開始」を実行。`terraform plan`が新規リソースの`+`（作成）のみであることをログで確認してから`apply`が走る想定（現状の設定は自動承認のため、実行前にリソース差分を必ず目視確認する）。

完了後、ビルドログの`terraform output`セクションから以下を控える:
- `cognito_user_pool_id`
- `cognito_user_pool_client_id`
- `dynamodb_table_names`（9テーブル: users, transactions, market_rates, sessions, permissions, batch_operations, segments, user_segments, invites）
- `s3_bucket_name`
- `amplify_ssr_compute_role_arn`（次のeで使用。Amplify Hosting上でAPIルートがDynamoDB/Cognitoを呼び出すために必須）

### d. 初期データ投入（Terraformでは管理していないマスタデータ）

DynamoDBテーブル自体はTerraformで作成されるが、以下のレコードはアプリ運用上の初期データとして手動投入が必要（意図的にTerraform管理外としている。理由は[infra/dynamodb/main.tf](../../infra/dynamodb/main.tf)のコメント参照）。

**① 権限テーブル（`futura-{env}-permissions`）** — `administrator` / `user` グループの権限レコード

※管理者（`admin@example.com`）が初回ログインすると、`users`テーブルが空であることを検知して自動的に同期処理が走り（[login.post.ts](../../server/api/auth/login.post.ts) → `syncCognitoToDatabase`）、このレコードは自動投入される。そのため本来は手動投入不要だが、初回ログイン前に権限を確定させておきたい場合や自動同期が失敗した場合のフォールバックとして、以下のコマンドでも投入できる。

```bash
ENV=dev  # 環境に応じて変更
TABLE="futura-${ENV}-permissions"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

aws dynamodb put-item --table-name "$TABLE" --item '{
  "group_name": {"S": "administrator"},
  "permissions": {"L": [
    {"S":"profile:read"},{"S":"profile:update"},{"S":"dashboard:access"},
    {"S":"transaction:read"},{"S":"transaction:request"},{"S":"account:create-sub"},
    {"S":"market_rate:read"},{"S":"admin:access"},
    {"S":"user:create"},{"S":"user:read"},{"S":"user:update"},{"S":"user:delete"},{"S":"profile:approve"},
    {"S":"group:create"},{"S":"group:read"},{"S":"group:update"},{"S":"group:delete"},
    {"S":"admin:transaction:read"},{"S":"transaction:create"},{"S":"transaction:approve"},
    {"S":"market_rate:create"},
    {"S":"batch:execute"},{"S":"batch:read"},
    {"S":"segment:create"},{"S":"segment:read"},{"S":"segment:update"},{"S":"segment:delete"},
    {"S":"invite:create"},{"S":"invite:read"},{"S":"invite:revoke"}
  ]},
  "description": {"S": "Full system administrator permissions - all features accessible"},
  "created_at": {"S": "'"$NOW"'"},
  "updated_at": {"S": "'"$NOW"'"}
}'

aws dynamodb put-item --table-name "$TABLE" --item '{
  "group_name": {"S": "user"},
  "permissions": {"L": [
    {"S":"profile:read"},{"S":"profile:update"},{"S":"transaction:read"},
    {"S":"transaction:request"},{"S":"dashboard:access"},{"S":"market_rate:read"},
    {"S":"account:create-sub"}
  ]},
  "description": {"S": "Standard user permissions"},
  "created_at": {"S": "'"$NOW"'"},
  "updated_at": {"S": "'"$NOW"'"}
}'
```

権限一覧の正本は[server/utils/permission-definitions.ts](../../server/utils/permission-definitions.ts)。新しい権限キーが増えた場合はここを更新した上で、既存環境の`administrator`グループにも追加する（下記「2. インフラ・権限構成の変更」を参照）。

**② 相場テーブル（`futura-{env}-market-rates`）** — 1BTC=1JPY固定レコード

円建て運用のため、相場は固定値1件をシードする。

```bash
TABLE="futura-${ENV}-market-rates"
aws dynamodb put-item --table-name "$TABLE" --item '{
  "rate_id": {"S": "1704067200"},
  "timestamp": {"S": "2024-01-01T00:00:00.000Z"},
  "btc_jpy_rate": {"N": "1"},
  "created_by": {"S": "system"},
  "created_at": {"S": "2024-01-01T00:00:00.000Z"}
}'
```

管理画面の「相場価格設定」は編集操作を無効化しているため、以後この値が変わることはない。

### e. Amplifyアプリの作成

環境ごとに1つのAmplifyアプリを作成する（`futura-dev` / `futura-stg` / `futura-prod`）。

1. Amplifyコンソールで「新規アプリの作成」→ GitHubリポジトリ・対象ブランチ（例: dev環境なら`develop`ブランチ）を接続
2. ビルド設定は自動検出された`amplify.yml`（リポジトリ直下）をそのまま使用
3. **SSR Compute roleの割り当て（必須）**：`server/api/**`はAmplify Hosting Compute上で動作するが、これはTerraformが作る`lambda_execution`ロール（未使用のプレースホルダーLambda専用）とは別物で、割り当てないとDynamoDB/Cognitoへのアクセスが一切できずログイン等が失敗する（`Could not load credentials from any providers`）。
   - アプリ作成後、「App settings」→「IAM roles」→「Compute role」→「Edit」
   - cで控えた`amplify_ssr_compute_role_arn`のロールを選択して保存
   - CLIの場合: `aws amplify update-app --app-id <APP_ID> --compute-role-arn <ROLE_ARN>`
4. **環境変数**を設定:

   | 変数名 | 値 |
   |---|---|
   | `STAGE` | `dev` / `stg` / `prod`（amplify.ymlが`.env.{STAGE}`を読み分ける） |
   | `NUXT_PUBLIC_COGNITO_USER_POOL_ID` | cで控えたCognito User Pool ID |
   | `NUXT_PUBLIC_COGNITO_CLIENT_ID` | cで控えたCognito Client ID |

5. 「詳細設定」→「Server-Side Rendering (SSR) deployment」で **Enable SSR app logs** を有効化（Nuxtのアダプター経由デプロイのため明示的な有効化が必須。これはCompute roleとは別の、ログ配信用のAmplifyサービスロール）
6. 保存してデプロイを実行

### f. 動作確認

1. ビルドログで`.amplify-hosting/`が生成され、`deploy-manifest.json`のルーティングにエラーがないことを確認
2. デプロイ後のURLにアクセスし、ログイン画面が表示されることを確認
3. 初期管理者アカウント（`admin@example.com` / `TempAdmin123!`）でログインし、ダッシュボード・管理画面が表示されることを確認

### g. セキュリティ対応（本番環境は特に必須）

- 初期パスワード（`admin@example.com`）を変更
- テストユーザー（`user@example.com`、存在する場合）を削除または無効化
- Amplifyアプリのアクセス制御（Basic認証等）を必要に応じて設定

## 2. インフラ・権限構成の変更（既存環境への変更）

1. `infra/`配下の`.tf`ファイルを編集し、PRでレビュー
2. マージ後、対象環境のCodeBuildプロジェクト（`futura-infra-deploy-{env}`）で「ビルドの開始」を実行
3. ビルドログの`terraform plan`結果を確認（想定外の削除・置換が出ていないか必ず目視）— 現状`-auto-approve`のため、plan確認はapply前のこのタイミングでしか行えない
4. 権限キーを追加した場合（`permission-definitions.ts`変更時）は、管理画面の「グループ管理」→ 対象グループ → 権限編集から手動で追加する（`administrator`グループは全権限、`user`グループは必要な範囲のみ）。DynamoDBを直接`update-item`しても良い
5. 複数環境がある場合は dev → stg → prod の順に反映し、各段階で動作確認する

## 3. アプリケーションデプロイ

- **通常運用**: 各環境に対応するブランチへpush/mergeすると、Amplifyが自動的にビルド・デプロイする（dev/stg/prod共通、本番も自動デプロイ）
- **ビルド状況の確認**: Amplifyコンソールの対象アプリ →「ホスティング」→ ビルド履歴からログを確認
- **ロールバック**: Amplifyコンソールの「ホスティング」→ 過去のデプロイを選択して「このバージョンを再デプロイ」。DynamoDB/Cognito側のインフラはTerraform state（S3のバージョニング）から復元
- **環境変数の変更**: Amplifyコンソールの「環境変数」から変更後、再デプロイが必要（自動では反映されない）

## トラブルシューティング

インフラ（Terraform/CodeBuild）関連のエラーは[infra/README.md](../../infra/README.md#トラブルシューティング)・[infra/docs/CODEBUILD_SETUP.md](../../infra/docs/CODEBUILD_SETUP.md#トラブルシューティング)を参照。

Amplifyビルドが失敗する場合、まず以下を確認:
- `STAGE`環境変数が設定されているか（未設定だとdev扱いになる）
- `.env.{STAGE}`ファイルがリポジトリに存在するか

### エラー: `Could not load credentials from any providers`（CloudWatch Logsに出力される）

ログイン・DynamoDB書き込み・Cognitoのグループ取得など、AWS SDKを使う処理全般が失敗する。一方でCognitoの`InitiateAuth`（ログイン自体）は成功する、という組み合わせで発生する場合、**SSR Compute roleが未割り当て**が原因。`InitiateAuth`/`RespondToAuthChallenge`はIAM認証不要のCognito公開APIのため素通りするが、`AdminListGroupsForUser`等のAdmin系APIやDynamoDBは必ずIAM認証が必要なため、Compute role未割り当てだと即座にこのエラーになる。

**対処**: 上記「e. Amplifyアプリの作成」手順3の通り、`terraform output amplify_ssr_compute_role_arn`のロールをAmplifyアプリの「App settings」→「IAM roles」→「Compute role」に割り当てる（既存環境で未対応の場合は今すぐ対応が必要）。
- SSRログが有効な場合、CloudWatch Logsで`.amplify-hosting/compute/default`側のランタイムエラーを確認
