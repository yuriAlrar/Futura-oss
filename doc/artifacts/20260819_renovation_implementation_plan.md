# モバイル対応・円建て統一・グループ/セグメント機能 実装計画

関連ドキュメント：[20260819_renovation_design.md](./20260819_renovation_design.md)（設計ドキュメント、本計画はこれに基づく）

## 0. フェーズ構成

依存関係とリスクを踏まえ、以下の順序を推奨する。Phase 0（データ基盤）は他の全フェーズの前提になるため最初に着手する。Phase 1（円建て統一）は影響ファイル数が多いため単独フェーズとして確保する。Phase 4〜7（セグメント/運用停止/サブアカウント/招待制登録）はPhase 0以降であれば並行着手も可能。

| Phase | 内容 | 依存 | 規模目安 |
|---|---|---|---|
| 0 | データ基盤・Terraform変更 | なし | 中 |
| 1 | 円建て表記統一・レート固定 | Phase 0 | 中〜大（影響範囲広） |
| 2 | 取引履歴の全件表示 | なし | 小 |
| 3 | ショートカットアイコン・タイトル整備 | なし | 小 |
| 4 | セグメント機能 | Phase 0 | 中 |
| 5 | 運用停止ステート | Phase 0（4と合わせて実施が効率的） | 小 |
| 6 | サブアカウント機能 | Phase 0 | 中 |
| 7 | 招待制登録 | Phase 0、Phase 6と一部基盤共通 | 中〜大 |
| 8 | メモ消失バグ調査 | 総合テスト時 | 未定（本計画では未着手） |

## Phase 0: データ基盤・Terraform

- [ ] `infra/dynamodb/main.tf`：`users`テーブルに`parent_user_id`属性・`ParentUserIndex`（GSI）追加
- [ ] `infra/dynamodb/main.tf`：`users`テーブルに`operation_status`属性追加（GSIは不要、フィルタ用途のみ）
- [ ] `infra/dynamodb/main.tf`：新規テーブル`segments`（PK: `segment_id`）
- [ ] `infra/dynamodb/main.tf`：新規テーブル`user_segments`（PK/SK構成＋`UserSegmentIndex` GSI）
- [ ] `infra/dynamodb/main.tf`：新規テーブル`invites`（PK: `invite_code`）
- [ ] `types/index.ts`：`User`（`parent_user_id`, `operation_status`）、`Segment`、`UserSegmentMembership`、`Invite`、`Transaction`（`requested_jpy_amount`）、`BatchOperation`（`target_segment_id`）の型追加・更新
- [ ] `server/utils/`：`segment-helpers.ts`（セグメントCRUD・所属ユーザー取得）、`invite-helpers.ts`（招待コード生成・検証・失効）を新規追加
- [ ] `nuxt.config.ts`の環境変数（テーブル名）に新規テーブルを追加

## Phase 1: 円建て表記統一・レート固定

- [ ] `market_rates`テーブルに1BTC=1JPYの固定レコードをシード
- [ ] `server/api/admin/market-rates/*`、`server/api/market-rates/*`：作成・更新系エンドポイントにガードを追加し編集不可にする
- [ ] `admin/rates.vue`、`CreateMarketRateDialog.vue`、`EditMarketRateDialog.vue`、`CSVUploadDialog.vue`：操作系UIをdisabled化（画面自体は残す）
- [ ] `components/common/CurrencyInput.vue`：JPYモードをデフォルト化し唯一の入力手段にする（BTC選択肢を撤去。既存のコメントアウトされたJPY選択肢を有効化）
- [ ] `pages/dashboard.vue`：表示ラベルを円表記に統一、グラフの軸を`btc_amount`から`jpy_value`基準に変更
- [ ] `components/user/AssetHistoryTable.vue`、`TransactionDetailsDialog.vue`（user/admin両方）、`TransactionRejectDialog.vue`、`CreateTransactionDialog.vue`、`BatchOperationController.vue`、`BatchOperationDetailDialog.vue`、`GroupPermissionViewer.vue`：BTC表記を円表記へ置換
- [ ] `components/user/BTCRateChart.vue`：ユーザー画面から撤去
- [ ] `utils/format.ts`：表示フォーマッタの単位表記を円に変更（内部関数名・変数名は維持）
- [ ] `server/api/transactions/request.post.ts`：`requested_jpy_amount`のスナップショット保存を追加
- [ ] 機械チェック：全画面で"BTC"という文字列がUIテキストとして残っていないことをgrep等で確認

## Phase 2: 取引履歴の全件表示

- [ ] `pages/transactions.vue`：ページネーション/無限スクロールUI追加（スマホ利用が前提のためカード型リスト＋無限スクロール推奨）
- [ ] `pages/transaction-requests.vue`：同様の対応
- [ ] `server/api/transaction-requests.get.ts`：`status='all'`時の全件scanをGSIクエリのUnion方式に見直し（任意、パフォーマンス改善）

## Phase 3: ショートカットアイコン・タイトル整備

- [ ] `public/favicon.ico`新規作成（`/public`ディレクトリ自体を新設）
- [ ] `public/apple-touch-icon.png`新規作成
- [ ] `public/manifest.json`新規作成、`nuxt.config.ts`のhead設定にlink/manifest参照を追加
- [ ] `nuxt.config.ts`（title: 'Futura'）と`app.vue`（title: 'M・S CFD App'）のタイトル不整合を解消
- [ ] **着手前に確認**：正式名称・アイコン素材が未確定のため、実装前にデザイン素材と名称を確定させる

## Phase 4: セグメント機能

- [ ] `server/api/admin/segments/`配下にCRUD API新設（`segments`テーブル）
- [ ] `server/api/admin/segments/[segmentId]/users/`配下にメンバー管理API新設（`user_segments`テーブルへの追加・削除・一覧）
- [ ] `server/utils/permission-definitions.ts`：`segment:create/read/update/delete`権限追加
- [ ] `pages/admin/segments.vue`（新規画面）、`SegmentManagementDialog.vue`（新規コンポーネント）
- [ ] `server/utils/batch-helpers.ts`：`getActiveUsers()`をセグメント指定対応に拡張（`getUsersBySegment(segmentId)`を新規追加）
- [ ] `pages/admin/batch-operations.vue`、`BatchOperationController.vue`：対象セグメント選択UI追加
- [ ] `server/api/admin/batch-operations/index.post.ts`：`target_segment_id`を受け取り、セグメント経由のユーザー取得に切替。複数セグメント選択を許容する場合はユーザーIDの重複除去（Set使用）を実装

## Phase 5: 運用停止ステート

- [ ] `User`型に`operation_status`追加（Phase 0で対応済みなら型のみ確認）
- [ ] `server/api/admin/users/[userId]/`配下に運用停止/解除エンドポイント新設（既存の`suspend.post.ts`＝ログイン停止とは別物として実装）
- [ ] `server/utils/batch-helpers.ts`：`getActiveUsers()`系のフィルタに`operation_status !== 'suspended'`条件を追加
- [ ] `pages/admin/users.vue`、`UserDetailsDialog.vue`：運用停止トグルUI追加（既存の「アカウント停止」ボタンと明確に区別できるUI文言にする）

## Phase 6: サブアカウント機能

- [ ] `users`テーブルの`parent_user_id`・`ParentUserIndex`（Phase 0で対応済み）
- [ ] `account:create-sub`権限を`user`グループのデフォルト権限に追加
- [ ] `server/api/account/sub-accounts/`配下に作成・一覧APIを新設（一般ユーザー向け。内部で`AdminCreateUser` + `AdminAddUserToGroup('user')` + 仮パスワード発行を実行し、`parent_user_id`・`profile_approved: false`でDynamoDBに保存）
- [ ] フロント：`pages/profile.vue`等にサブアカウント作成・一覧UIを追加
- [ ] `pages/admin/approvals.vue`：サブアカウントも既存の承認フローでそのまま扱えることを確認（ロジック変更不要のはずだが動作確認は必須）

## Phase 7: 招待制登録

- [ ] `invites`テーブルCRUD（発行・失効・一覧）：`server/api/admin/invites/`配下に新設
- [ ] `pages/admin/invites.vue`（新規、招待リンク発行・管理UI）
- [ ] 公開API：`server/api/public/invites/[code].get.ts`（招待コードの有効性確認、認証不要）
- [ ] 公開API：`server/api/public/register.post.ts`（招待コード検証 → `AdminCreateUser` + `AdminSetUserPassword` → invite失効。認証不要のためレート制限必須）
- [ ] `pages/register.vue`（新規、公開ページ。プロフィール入力項目は管理者作成ユーザーと同様：氏名・住所・電話番号・メールアドレス・パスワード）
- [ ] レート制限ミドルウェアを`server/middleware/`に新規追加（IPベース等、登録エンドポイント向け）
- [ ] 登録直後は`profile_approved: false`で作成し、既存の承認フローに乗せる

## Phase 8: メモ消失バグ調査

- [ ] 本計画では対応を見送り。総合テスト時に再現手順（発生画面・操作順序）を確認してから改めて着手する

## リスク・注意点

- **Phase 1（通貨表記統一）**：影響ファイル数が多く、表示漏れ・UI崩れのリグレッションが起きやすい。全画面の手動確認に加え、"BTC"文字列の機械的grepチェックを組み込む
- **Phase 7（招待制登録）**：未認証エンドポイントでCognito管理者操作を代行する設計のため、セキュリティレビュー（レート制限・入力サニタイズ・招待コードの推測困難性）を必須とする
- Terraform変更は開発環境で先行適用し、本番適用前に`terraform plan`のdiffを必ず確認する

## テスト観点（抜粋）

- 円表記：全画面で"BTC"という文字列がUI上に残っていないこと
- セグメント：複数セグメント選択時のユーザー重複除去、セグメント未所属ユーザーが一括操作対象から正しく除外されること
- 運用停止：運用停止中でもログイン・個別入出金リクエスト・管理者による個別取引作成が引き続き行えること、一括操作の対象からは除外されること
- サブアカウント：承認前後でのログイン可否、本アカウントからのサブアカウント一覧表示、`parent_user_id`の紐付け
- 招待制登録：同一招待コードの二重使用防止、失効後のアクセス拒否、レート制限の動作確認

## 着手前に確認したい未決事項

- favicon・アプリ名称（"Futura"継続 or 変更）の最終決定とデザイン素材
- サブアカウントの資産合算表示の要否
- 取引履歴UIの具体形（無限スクロール/ページャー）
