# デプロイ運用手順書

初期環境構築・インフラ構成変更・アプリケーションデプロイの一連の手順をまとめたrunbookです。個別の詳細は既存ドキュメントを参照しつつ、ここでは「何をどの順番で行うか」を一本化しています。

## 関連ドキュメント

- [infra/README.md](../../infra/README.md) — Terraformによるインフラ構築の詳細（リソース一覧、変数、トラブルシューティング）
- [infra/docs/CODEBUILD_SETUP.md](../../infra/docs/CODEBUILD_SETUP.md) — インフラデプロイをCodeBuildへ移行する場合のセットアップ詳細
- [database_specification.md](../specs/database_specification.md) — DynamoDBテーブル設計

## 全体構成

```
 ┌──────────────┐     git push       ┌──────────────────┐
 │  操作端末      │ ─────────────────► │  CodeCommit       │
 │  git のみ      │                    │  futura（単一）    │
 └──────────────┘                    │   ├ main → prod    │
                                     │   └ stg  → stg     │
                                     └────────┬─────────┘
                                              │ ブランチごとに接続（自動ビルド）
        ┌─────────────────────────┐           ▼
        │  AWS CloudShell          │   ┌──────────────────────────┐
        │  Terraform を実行         │   │  AWS Amplify Hosting      │
        └───────────┬─────────────┘   │  - 静的アセット (SPA)       │
                    │ apply           │  - server/api/** (Compute) │
                    ▼                 │  futura-{env}(アプリ)      │
        ┌─────────────────────────┐   └──────────┬───────────────┘
        │  infra/ (Terraform)      │              │ 参照
        │  - Cognito User Pool     │◄─────────────┘
        │  - DynamoDB (9テーブル)   │
        │  - S3 (アップロード)       │
        │  - IAM (SSR Computeロール)│
        │  Lambda(placeholder,未使用)│
        └─────────────────────────┘
```

運用環境は **prod / stg** の2系統（`dev` は既存環境として残存）。
それぞれ独立したTerraform state（同一バケット内の別キー）・独立したAmplifyアプリを持ち、
**CodeCommitの別ブランチ**に対応する。

> 環境名は `dev` / `stg` / `prod` のみ有効です（[infra/variables.tf](../../infra/variables.tf)）。
> `staging` と書くとバリデーションで弾かれます。

### 役割分担

| 場所 | 担当 | 必要なもの |
|---|---|---|
| 操作端末 | ソースの push のみ | `git` と CodeCommitへの認証手段のみ |
| CloudShell | Terraform（インフラ構築・変更） | ブラウザのみ。認証はコンソールログインを継承 |
| Amplify | アプリのビルド・ホスティング | CodeCommit接続で自動 |

**なぜGitHubではなくCodeCommitか**: セキュリティ要件によりAWSから外部Gitプロバイダに接続できないため。
また、Amplify Hostingは**SSRアプリの手動デプロイ（zip/S3アップロード）を公式にサポートしていない**ため、
Gitプロバイダ接続が必須であり、AWS内で完結するCodeCommitを選択している。

---

## 1. 新規環境構築（初期構築）

新しい環境を立ち上げる際の手順。**a〜hの順番で実施する。**

### 前提

**デプロイ対象のソースがCodeCommitリポジトリ `futura` にpush済みであること。**
push方法（SSH鍵 / git-remote-codecommit / HTTPS Git認証情報）は問わない。

リポジトリは**全環境で1つ**を共有し、**環境はブランチで分ける**。
インフラ（Terraform）とアプリ（Amplify）は必ず同じブランチを見る。

| 環境 | ブランチ | Amplifyアプリ |
|---|---|---|
| prod | `main` | `futura-prod` |
| stg | `stg` | `futura-stg` |

> `cloudshell.sh` はこの対応を `expected_branch_for()` に持っており、
> 想定外のブランチで実行すると警告し、deploy時は確認を求める。
> 例外的に別ブランチを試したい場合は `DEPLOY_BRANCH=<branch>` で上書きできる。

リリースは **`stg` で検証 → `main` へマージ → prod反映** の順に進める。

リポジトリがまだ無い場合はCloudShellで作成する:

```bash
aws codecommit create-repository --repository-name futura
```

### a. CloudShellの準備とソース取得（リージョンごとに初回のみ）

CloudShellを開き（リージョン: `us-east-1`）、CodeCommitからcloneする。
CloudShellはコンソールログインの認証情報を継承しているためcredential helperが即使える
（AWS専用の使い捨て環境なのでglobal設定で問題ない）:

```bash
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
cd ~ && git clone https://git-codecommit.us-east-1.amazonaws.com/v1/repos/futura
```

> Terraformの導入は次のステップの `cloudshell.sh` が自動で行う（`$HOME/bin` に配置）。
> **CloudShellの `$HOME` は最終利用から120日で削除される。** 消えるのはTerraformバイナリだけで、
> state本体はS3にあるため、スクリプトを再実行すれば自動で復旧する。

### b. state バケットの用意

`backend.hcl` は**stateファイルではなく、stateの置き場所を指す4行の接続情報**。
state本体（`terraform.tfstate`）はS3上にあり、`terraform init` 以降は自動で読み書きされる。
**このファイルは `cloudshell.sh` が環境名から自動生成する**ので手書きは不要。

まず既存のstateバケットを確認する:

```bash
aws s3api list-buckets --query "Buckets[?starts_with(Name, 'futura-terraform-state-')].Name" --output text
```

#### 0件の場合（新規アカウント）— `setup-backend.sh` を1回だけ実行

```bash
cd ~/futura/infra
ENVIRONMENT=prod ./setup-backend.sh
```

S3バケットを暗号化・バージョニング有効で作成する。
以降は `cloudshell.sh` が自動検出するので、`TF_STATE_BUCKET` の指定は不要。

> ⚠️ **このスクリプトは「アカウントで初回の1回だけ」実行する。**
> バケット名を `date +%s` から生成するため、**実行するたびに別名のバケットを作る**。
> 2つ目以降の環境（stg等）では実行せず、既存バケットをそのまま使う
> （`cloudshell.sh` が `key` を `futura/{環境名}/terraform.tfstate` に振り分ける）。

#### 1件の場合 — 何もしなくてよい

`cloudshell.sh` が自動検出する。

#### 2件以上ある場合 — どれを使うか明示する

過去に `setup-backend.sh` が複数回実行されると孤立バケットが残る。
`cloudshell.sh` が各バケットの中身を並べて表示するので、対象環境のstateを持つ方を選ぶ:

```bash
export TF_STATE_BUCKET=<bucket-name>
echo 'export TF_STATE_BUCKET=<bucket-name>' >> ~/.bashrc
```

> 誤ったバケットを選ぶと、Terraformが空のstateを掴んで「まだ何も作られていない」と誤認し、
> apply時に既存リソースと衝突するか**リソースを二重作成する**。
> DynamoDBは名前が固定なので衝突して止まるが、**Cognitoはプール名の重複を許すため黙って増える**。

#### S3バケット名のグローバル衝突に注意

アップロード用バケットの名前は **`.env.{環境名}` の `NUXT_S3_UPLOADS_BUCKET` が正本**で、
`cloudshell.sh` がこの値を読み取ってTerraformへ渡す。バケットを作る側（Terraform）と
読む側（アプリ）が必ず同じ値になるため、片方だけ直して壊す事故が起きない。

**S3のバケット名は全AWSアカウント横断でグローバル一意**なので、別アカウントで同名が
使われていると apply が失敗する（`the region us-east-1 is wrong; expecting ...` のような
エラーになることもある）。

デプロイ前の確認:

```bash
aws s3api head-bucket --bucket $(grep '^NUXT_S3_UPLOADS_BUCKET=' ../.env.prod | cut -d= -f2)
```

`404` なら空き。それ以外なら**`.env.{環境名}` の値を書き換えて**CodeCommitへpushする。
環境ごとに規則がばらつくと運用で混乱するため、**全環境に共通のサフィックスを付ける**運用としている:

```
NUXT_S3_UPLOADS_BUCKET=futura-{環境名}-uploads-{共通サフィックス}
```

> バケット名は事実上の公開情報なので、サフィックスにAWSアカウントIDのような値は使わないこと。

### c. Terraformの実行とoutputsの確認

```bash
cd ~/futura/infra
./cloudshell.sh deploy prod
```

スクリプトは以下を順に実行する:

1. 環境名の検証（`dev` / `stg` / `prod` のみ）
2. Terraform 1.7.5 の導入（未導入時のみ）
3. state バケットの検出
4. `backend.hcl` と `terraform.tfvars` を**同じ環境名から生成**（両者の食い違いを防ぐため）
5. `terraform init` → `terraform plan`
6. **planに削除・置換が含まれる場合は警告**し、環境名の再入力を要求
7. 確認プロンプト後に `terraform apply`
8. `terraform output` を表示

**plan の結果は必ず目視確認する。** 新規環境なら全リソースが `+`（作成）のみのはず。
`-`（削除）が出る場合は state の向き先が違う可能性が高いので、applyせずに
`TF_STATE_BUCKET` と環境名を見直すこと。

applyせずにplanだけ見たい場合:

```bash
./cloudshell.sh plan prod
```

完了後、以下を控える（`./cloudshell.sh output prod` でいつでも再表示できる）:

- `cognito_user_pool_id`
- `cognito_user_pool_client_id`
- `dynamodb_table_names`（9テーブル: users, transactions, market_rates, sessions, permissions, batch_operations, segments, user_segments, invites）
- `s3_bucket_name`
- `amplify_ssr_compute_role_arn`（fで使用。Amplify Hosting上でAPIルートがDynamoDB/Cognitoを呼び出すために必須）

### d. 初期データ投入（Terraformでは管理していないマスタデータ）

DynamoDBテーブル自体はTerraformで作成されるが、以下のレコードはアプリ運用上の初期データとして
手動投入が必要（意図的にTerraform管理外としている。理由は[infra/dynamodb/main.tf](../../infra/dynamodb/main.tf)のコメント参照）。

```bash
./cloudshell.sh seed prod
```

投入されるのは2件:

**① 権限レコード（`futura-{env}-permissions`）** — `administrator` / `user` グループ

権限一覧は[server/utils/permission-definitions.ts](../../server/utils/permission-definitions.ts)の
`DEFAULT_GROUP_PERMISSIONS` が正本で、**スクリプトは実行時にそこから抽出する**
（`administrator` は全権限、`user` は同ファイルの `user` 配列）。
値をスクリプト側に複製していないため、正本に権限を追加すれば自動的に追随する。

抽出結果は投入前に件数が表示され、`user` の権限が全権限一覧に含まれるかも検証される。
抽出に失敗した場合は投入せず中断する。

```
✅ 権限定義を抽出しました: administrator=30件 / user=7件
```

> 管理者（`admin@example.com`）が初回ログインすると、`users`テーブルが空であることを検知して
> 自動的に同期処理が走り（[login.post.ts](../../server/api/auth/login.post.ts) → `syncCognitoToDatabase`）、
> このレコードは自動投入される。そのため本来は手動投入不要だが、初回ログイン前に権限を
> 確定させておきたい場合や、自動同期が失敗した場合のフォールバックとして使う。

**② 相場レコード（`futura-{env}-market-rates`）** — 1BTC=1JPY固定

円建て運用のため、相場は固定値1件をシードする。管理画面の「相場価格設定」は編集操作を
無効化しているため、以後この値が変わることはない。

> 権限キーを追加した場合は、既存環境の`administrator`グループにも反映が必要。
> 「2-2. インフラ・権限構成の変更」を参照。

### e. `.env.{STAGE}` の確認

[amplify.yml](../../amplify.yml) は `STAGE` 環境変数を見て `.env.dev` / `.env.stg` / `.env.prod` を
`.env` にコピーしてからビルドする。cで確認したテーブル名・バケット名が
対象ファイルの内容と一致しているか確認し、違う場合は修正してCodeCommitへpushする。

> CognitoのIDは `.env.*` には書かない。Amplifyの環境変数で管理する（fを参照）。

> S3アップロードバケット名は `.env.{STAGE}` の `NUXT_S3_UPLOADS_BUCKET` が正本で、
> `cloudshell.sh` がここからTerraformへ渡す。変更するときはこのファイルだけ直せばよい（b節を参照）。

#### 画像配信URL（`NUXT_IMAGE_BASE_URL`）

**このリポジトリは公開されているため、`.env.*` の `NUXT_IMAGE_BASE_URL` は
`https://resource.futura.example.com` というプレースホルダになっている。**
実値はAmplifyの環境変数で上書きする（fを参照）。

⚠️ **この値には前提となるインフラがあり、Terraform管理外**:

- アップロード用S3バケットは完全にプライベート（[infra/s3/main.tf](../../infra/s3/main.tf) で
  パブリックアクセスを4項目とも遮断）
- そのため画像配信にはバケットを origin とする**CloudFrontディストリビューションが必要**
- **Terraformはこれを作らない。** 環境ごとに、アップロード用バケットを origin とする
  ディストリビューションを手動で作成し、独自ドメインを割り当てる

設定しないまま運用すると、[upload/image.post.ts](../../server/api/upload/image.post.ts) が
`Image base URL is not configured` で500を返す。プレースホルダのまま設定した場合は
アップロード自体は成功するが、**保存されるURLが解決できずプロフィール画像とロゴが表示されない**。

> 将来的にはこのCloudFrontもTerraform管理に入れるべき箇所。

### f. Amplifyアプリの作成

環境ごとに1つのAmplifyアプリを作成する（`futura-stg` / `futura-prod`）。
**いずれも同じCodeCommitリポジトリ `futura` に接続し、ブランチだけを変える。**

| Amplifyアプリ | 接続ブランチ | `STAGE` |
|---|---|---|
| `futura-prod` | `main` | `prod` |
| `futura-stg` | `stg` | `stg` |

> ブランチが環境ごとに分かれているため、`stg` へのpushでprodがビルドされることはない。
> 逆に、**同じブランチに2つ以上のAmplifyアプリを接続すると1回のpushで両方がビルドされる**ので、
> 環境を追加する際は必ず別ブランチを割り当てること。

1. Amplifyコンソールで「新規アプリの作成」→ **AWS CodeCommit** を選択 → `futura` リポジトリの**対象環境のブランチ**（prodなら `main`、stgなら `stg`）を接続
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
   | `NUXT_IMAGE_BASE_URL` | 画像配信用CloudFrontのURL（eを参照）。`.env.*` のプレースホルダを上書きする |

5. 「詳細設定」→「Server-Side Rendering (SSR) deployment」で **Enable SSR app logs** を有効化（Nuxtのアダプター経由デプロイのため明示的な有効化が必須。これはCompute roleとは別の、ログ配信用のAmplifyサービスロール）。**これを忘れるとサーバー側のエラーが一切見えず、初回デプロイの障害切り分けができなくなる。**
6. 保存してデプロイを実行

### g. 動作確認

1. ビルドログで`.amplify-hosting/`が生成され、`deploy-manifest.json`のルーティングにエラーがないことを確認
2. デプロイ後のURL（`https://{branch}.{appId}.amplifyapp.com`）にアクセスし、ログイン画面が表示されることを確認
3. 初期管理者アカウント（`admin@example.com` / `TempAdmin123!`）でログインし、ダッシュボード・管理画面が表示されることを確認

### h. セキュリティ対応（本番環境は特に必須）

- 初期パスワード（`admin@example.com`）を変更
- テストユーザー（`user@example.com`、存在する場合）を削除または無効化
- Amplifyアプリのアクセス制御（Basic認証等）を必要に応じて設定

---

## 2. 継続デプロイ

### 2-1. アプリケーションの変更（日常運用）

操作端末からCodeCommitの**対象環境のブランチ**へpushするだけ。Amplifyが自動でビルド・デプロイする。

- stgへ反映: `stg` ブランチへpush
- prodへ反映: `stg` で検証後、`main` へマージ

> ブランチが分かれているため、`stg` へのpushがprodに波及することはない。

- **ビルド状況の確認**: Amplifyコンソール → 対象アプリ →「ホスティング」→ ビルド履歴
- **環境変数の変更**: Amplifyコンソールの「環境変数」から変更後、**再デプロイが必要**（自動では反映されない）

> GitHub等を併用している場合、**CodeCommitへのpushを忘れるとデプロイされない**点に注意。

### 2-2. インフラ・権限構成の変更

1. `infra/`配下の`.tf`ファイルを編集し、レビューを経て**対象環境のブランチ**へマージ
   （stgなら `stg`、prodなら `main`）

   > リポジトリが全環境で1つのため、**チェックアウトしているブランチが適用対象のコードを決める**。
   > `cloudshell.sh` は環境とブランチの食い違いを検知して確認を求めるが、
   > 未コミットの変更はそのまま適用される点に注意（こちらは警告のみ）。
2. CloudShellで最新を取得してデプロイ:

   ```bash
   cd ~/futura && git checkout <対象環境のブランチ> && git pull   # prod:main / stg:stg
   cd infra && ./cloudshell.sh deploy prod
   ```

   `backend.hcl` はgit管理外だが、スクリプトが毎回生成するので手当ては不要。

3. **`terraform plan` の結果を目視確認**（想定外の削除・置換が出ていないか）してから
   確認プロンプトに `y` を入力する。削除が含まれる場合はスクリプトが警告し、
   環境名の再入力を求めてくる。

4. 権限キーを追加した場合（`permission-definitions.ts`変更時）は、既存環境の権限レコードにも反映が必要:

   ```bash
   ./cloudshell.sh seed <env>
   ```

   スクリプトが正本から抽出し直すため、追加した権限が `administrator` に入る。

   > ⚠️ **`seed` は `put-item` でレコード全体を上書きする。**
   > 管理画面の「グループ管理」でグループの権限を個別にカスタマイズしている場合、
   > その変更は正本の内容で置き換えられる。カスタマイズを維持したい環境では、
   > 管理画面から対象グループの権限を手動で追加すること
5. **必ず stg → prod の順**に反映し、各段階で動作確認する（`stg` で確認してから `main` へマージ）

### 2-3. ロールバック

- **アプリ**: Amplifyコンソールの「ホスティング」→ 過去のデプロイを選択して「このバージョンを再デプロイ」
- **インフラ**: `.tf`を戻してCodeCommitへpush → 2-2の手順でapply。stateはS3のバージョニングから復元可能

---

## 3. 将来: インフラデプロイのCodeBuild移行

現状はCloudShellでTerraformを実行している。以下のいずれかを満たした時点でCodeBuildへの移行を検討する:

- **applyできる人を絞りたくなった** — CloudShellの権限はコンソールログイン者の権限そのもので、`iam:CreateRole` 等の強権限が必要になる。CodeBuildならサービスロールに閉じ込め、人間は `codebuild:StartBuild` だけで済む
- **運用者が2人以上になった** — state lockが必須になる（1-b参照）
- **applyの監査証跡が必要になった** — CloudTrailはAPI単位でしか残らず、plan差分は残らない

移行用の [infra/buildspec.yml](../../infra/buildspec.yml) は作成済み。ただし移行前に以下の是正が必要:

- `build`フェーズが `terraform apply -auto-approve` を直書きしているため、pushトリガーにすると**無条件applyが走る**。plan専用とapply専用でプロジェクトを分けるか、applyは手動`start-build`に限定する
- `artifacts` の `infra/terraform.tfstate` と `reports` の `infra/**/*` は**stateの機密情報が漏れる経路**になるため除外する

詳細は [infra/docs/CODEBUILD_SETUP.md](../../infra/docs/CODEBUILD_SETUP.md) を参照。

---

## トラブルシューティング

インフラ（Terraform）関連のエラーは[infra/README.md](../../infra/README.md#トラブルシューティング)を参照。

Amplifyビルドが失敗する場合、まず以下を確認:
- `STAGE`環境変数が設定されているか（未設定だとdev扱いになる）
- `.env.{STAGE}`ファイルがリポジトリに存在するか

### エラー: `Could not load credentials from any providers`（CloudWatch Logsに出力される）

ログイン・DynamoDB書き込み・Cognitoのグループ取得など、AWS SDKを使う処理全般が失敗する。一方でCognitoの`InitiateAuth`（ログイン自体）は成功する、という組み合わせで発生する場合、**SSR Compute roleが未割り当て**が原因。`InitiateAuth`/`RespondToAuthChallenge`はIAM認証不要のCognito公開APIのため素通りするが、`AdminListGroupsForUser`等のAdmin系APIやDynamoDBは必ずIAM認証が必要なため、Compute role未割り当てだと即座にこのエラーになる。

**対処**: 上記「1-f. Amplifyアプリの作成」手順3の通り、`terraform output amplify_ssr_compute_role_arn`のロールをAmplifyアプリの「App settings」→「IAM roles」→「Compute role」に割り当てる。
- SSRログが有効な場合、CloudWatch Logsで`.amplify-hosting/compute/default`側のランタイムエラーを確認

### エラー: `Invalid value for variable` / `Environment must be one of: dev, stg, prod`

環境名が `dev` / `stg` / `prod` 以外になっている（[infra/variables.tf](../../infra/variables.tf)）。
`staging` ではなく `stg` が正しい。

### `terraform plan` に想定外の削除・置換が出る

`backend.hcl` の `key` が別環境を指している可能性が高い。**applyせずに** `key` が
`futura/{対象環境}/terraform.tfstate` になっているか確認する。
