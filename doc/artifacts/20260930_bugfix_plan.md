# 不具合一斉修正 修正方針

2026-09-30 実施のコード調査で検出した不具合の修正方針。調査はページネーション考慮漏れ（データが全件取得できない不具合）を重点に、サーバーAPI・共通ユーティリティ・フロントエンドを対象に行った。

- 対象外：#7 は今後の課題として別途管理する
- 番号は調査報告時の番号をそのまま使う（高：#1〜#3、中：#4〜#15、低：L1〜L8）

## 0. 対象一覧

| ID | 重大度 | 概要 | 種別 |
|---|---|---|---|
| #1 | 高 | 不要なデバッグ用APIが残っている | 保守 |
| #2 | 高 | ユーザー選択肢が最新20件しか取得されない（3画面） | ページネーション |
| #3 | 高 | 取引承認処理の整合性チェック強化 | データ整合性 |
| #4 | 中 | 相場一覧が最新50件しか取得されない | ページネーション |
| #5 | 中 | `DynamoDBService` の `limit` が上限として機能しない | 共通基盤 |
| #6 | 中 | 管理ダッシュボードの「承認待ちユーザー」が常に0件 | 機能不全 |
| #8 | 中 | `AdminListGroupsForUser` が `NextToken` 未処理 | ページネーション |
| #9 | 中 | 相場を日時を変えずに再編集すると500エラー | 機能不全 |
| #10 | 中 | 一括処理で残高取得失敗ユーザーが黙って除外される／長時間化 | データ整合性 |
| #11 | 中 | Cognito同期がDB側の状態・名前・権限を上書きする | データ整合性 |
| #12 | 中 | 既存メールで新規登録すると招待コードが焼失する | 機能不全 |
| #13 | 中 | グループ取得失敗時の予備処理の整理 | 保守 |
| #14 | 中 | ログインCookieの属性見直し | 保守 |
| #15 | 中 | ユーザー1人分の取得にテーブル全件scanしている箇所がある | 性能 |
| L1 | 低 | 承認待ちリクエストの重複防止の強化 | データ整合性 |
| L2 | 低 | 1日の回数制限がUTC基準・メッセージと上限値が不一致 | 仕様不整合 |
| L3 | 低 | 相場の日時がタイムゾーンなしで保存されUTC解釈される | データ整合性 |
| L4 | 低 | 招待コード失効が無条件更新（使用済みを上書き・存在しないコードを作成） | データ整合性 |
| L5 | 低 | グループ削除時に権限レコードが残る | データ整合性 |
| L6 | 低 | 承認後にプロフィールを変更しても承認済みのまま | 仕様確認 |
| L7 | 低 | 資産推移表の「全期間」が30日分しかない | 表示 |
| L8 | 低 | サブアカウント一覧に削除済みが含まれる | 表示 |

## 1. 共通方針

- **ページネーション**：一覧APIのページング仕様（`page` / `limit` / `hasMore`、最大 `limit=100`）は変更しない。全件が必要な画面はフロント側で `hasMore` が false になるまでページを繰り返し取得する。
- **DynamoDBの状態遷移**：「読んでから条件なしで書き戻す」実装は `ConditionExpression` 付きの更新に置き換え、競合時は 409 を返す。
- **エラーの握りつぶし**：件数や残高の計算で、失敗を 0 や空配列で代用して処理を続ける実装は、失敗として扱う方向に改める。
- コード中のコメントは日本語で記述する。

## 2. 高

### #1 デバッグAPIの削除

- **現状**：開発時の動作確認用API（`server/api/debug/transactions-test.get.ts`）が残っており、運用上不要。
- **方針**：ファイルを削除する（呼び出し元なし）。`server/api/debug/` ディレクトリごと撤去する。
- **確認**：`grep -rn "debug/" pages components composables` で参照がないこと。

### #2 ユーザー選択肢の全件取得

- **現状**：`/admin/users` をパラメータなしで呼び、既定 `limit=20` の1ページ目しか使っていない。
  - [pages/admin/transactions.vue:283](../../pages/admin/transactions.vue) — ユーザー絞り込み／取引作成ダイアログの対象ユーザー
  - [components/admin/SegmentMembersDialog.vue:109](../../components/admin/SegmentMembersDialog.vue) — セグメント追加候補
  - [components/admin/UserGroupAssignmentDialog.vue:186](../../components/admin/UserGroupAssignmentDialog.vue) — グループ割当候補
- **方針**：
  1. `composables/useApiClient.ts` に全ページ取得ヘルパー `getAllPages<T>(url, params?)` を追加する。`limit=100` で `page` を進め、`hasMore === false` まで取得して `items` を連結して返す。途中でレスポンスが失敗した場合は例外を投げる（部分結果を正常扱いしない）。
  2. 上記3箇所をヘルパーに置き換える。
  3. 既存の [pages/transactions.vue:240](../../pages/transactions.vue) の独自ループもヘルパーに置き換えて実装を一本化する。
- **補足**：`pages/admin/users.vue` の入金ダイアログは `preselected-user-id` 指定で使っており、表示中ページのユーザーのみで問題ないため対象外。

### #3 取引承認処理の整合性チェック強化

- **現状**：[status.patch.ts](../../server/api/admin/transactions/[transactionId]/status.patch.ts) の承認・拒否処理で、承認時点の状態の検証が不十分。
- **方針**：
  1. 承認（`approved`）かつ `transaction_type === 'withdrawal'` の場合、承認前に `getTotalBalance` で現在残高（承認済みのみ）を取得し、`|amount| > 残高` なら 400（残高不足）を返す。対象の pending 取引自体は残高計算に含まれないため除外処理は不要。
  2. `put` を `update` に置き換え、`ConditionExpression: #status = :pending` を付与する。`ConditionalCheckFailedException` の場合は 409（既に処理済み）を返す。キーは `{ transaction_id, user_id }`。
  3. 取得元の `query('transaction_id = :id')` は一括処理の取引（同一 `transaction_id` を複数ユーザーで共有）もヒットするため、`items.length !== 1` の場合は 409（リクエスト取引ではない）として扱う。
- **フロント**：[pages/admin/transaction-requests.vue](../../pages/admin/transaction-requests.vue) で 400／409 のメッセージを表示できることを確認する（既存のエラー表示で足りるか確認し、不足時のみ修正）。

## 3. 中

### #4 相場一覧の全件取得

- **現状**：[pages/admin/rates.vue:220](../../pages/admin/rates.vue) が `/market-rates` をパラメータなしで呼び、最大50件で止まる。
- **方針**：#2 の `getAllPages` に置き換える。サーバー側 [server/api/market-rates/index.get.ts](../../server/api/market-rates/index.get.ts) の `limit: limit * page` は #5 の仕様変更後は総件数が壊れるため削除する（全件scan→ソート→スライスのまま）。

### #5 `DynamoDBService` の `limit` の意味の是正

- **現状**：[server/utils/dynamodb.ts](../../server/utils/dynamodb.ts) の `query` / `scan` は `fetchAll` 既定 true のため、`limit` を渡しても「1リクエストあたりの評価件数」にしかならず、最後まで取得し続ける。scanで小さい `limit` を渡すと往復回数が爆発する（例：`limit: 3` で users 全件を3件ずつ）。
- **方針**：`limit` を「返却する最大件数」の意味に変更する。
  - `limit` 指定時：取得済み件数が `limit` に達するか `LastEvaluatedKey` がなくなるまでループし、`items` を `limit` 件に切り詰める。
  - DynamoDBへの `Limit` は、`filterExpression` なしの場合のみ「残り件数」を渡す。フィルタありの場合は渡さない（1MB単位のページで取得し、往復回数を抑える）。
  - `fetchAll: false` の挙動（1ページのみ）は現状維持。
  - 切り詰めた場合の `lastEvaluatedKey` は再開位置として正確でないため、JSDocにその旨を明記する（現状、再開に使っている呼び出し元はない）。
- **呼び出し元の見直し**（`limit` を渡している全箇所）：

| 呼び出し元 | 対応 |
|---|---|
| `admin/dashboard/index.get.ts` 承認待ち取引 `limit: 3` | そのまま（最新3件の意図どおりになる） |
| 同 承認済み取引 `limit: 3` | そのまま |
| 同 承認待ちユーザー `limit: 3` | #6 で作り直し |
| 同 最新ユーザー `limit: 50` / 最新セッション `limit: 50` | `limit` を削除し全件取得→ソート（任意の50件ではなく最新を取るため） |
| `admin/transaction-requests.get.ts` `limit + offset` | `limit` を削除（`total` が正しく出なくなるため全件取得を維持） |
| `market-rates/index.get.ts` `limit * page` | #4 のとおり削除 |
| `session.ts` `getAllSessions({ limit })` | そのまま（上限の意図どおりになる） |
| `cognito-sync.ts` `ensureInitialSync` `limit: 1` | 未使用関数のため削除 |
| `debug/transactions-test.get.ts` | #1 で削除 |

### #6 管理ダッシュボードの承認待ちユーザー

- **現状**：[admin/dashboard/index.get.ts:51-80](../../server/api/admin/dashboard/index.get.ts) が `status = 'pending'` で絞り込むが、`User.status` は `active | suspended | deleted` のみで常に0件。
- **方針**：承認待ちの判定を `/api/admin/users?profile_approved=pending` と揃える（`status <> deleted AND (attribute_not_exists(profile_approved) OR profile_approved = false)`）。scanは1回にまとめ、総数は `items.length`、表示用は `created_at` 降順の先頭3件とする。

### #8 `AdminListGroupsForUser` のページネーション

- **現状**：[cognito-groups.ts:39](../../server/utils/cognito-groups.ts) が1ページ目のみ取得。
- **方針**：`listCognitoGroups` と同様に `NextToken` がなくなるまでループする。

### #9 相場編集の同一キー更新エラー

- **現状**：[market-rates/[rateId]/index.put.ts:73](../../server/api/admin/market-rates/[rateId]/index.put.ts) が Delete + Put を同一トランザクションで実行しており、日時が変わらない場合は同一キーへの2操作となり DynamoDB がエラーを返す。
- **方針**：新旧の `timestamp` が一致する場合は `update`（`btc_jpy_rate`, `updated_at`, `updated_by` のみ）で更新する。異なる場合のみ現行の Delete + Put を使う。
- **補足**：実装計画 Phase 1 の「相場の作成・更新を編集不可にするガード」は未実装。本対応ではガード追加は行わず、不具合修正のみとする（ガードの要否は別途判断）。

### #10 一括処理の失敗扱いと処理時間

- **現状**：[batch-helpers.ts](../../server/utils/batch-helpers.ts) の `getUserBalance` は失敗時に 0 を返し、増減額0として黙ってスキップされる（失敗件数にも含まれない）。残高取得はユーザーごとに逐次実行。
- **方針**：
  1. `getUserBalance` は例外を投げるように変更し、`createBatchTransactions` 側で捕捉して `errors` / `failedCount` に計上する。
  2. 残高取得を同時実行数上限付き（10並列）で並列化する。外部ライブラリは追加せず、小さな並列実行ヘルパーを `batch-helpers.ts` 内に実装する。
  3. `processed_user_count` に「増減額0でスキップしたユーザー」が含まれないことを明確にするため、スキップ件数をログに出す（レスポンス型の変更はしない）。
- **範囲外**：リクエスト内同期実行そのものの非同期化（キュー化等）は構成変更を伴うため本対応では行わない。

### #11 Cognito同期による上書き

- **現状**：[cognito-sync.ts](../../server/utils/cognito-sync.ts) の同期で、(a) 停止中ユーザーが Cognito の `UserStatus=CONFIRMED` を理由に `active` へ戻る、(b) DB側で変更した名前が Cognito の値で上書きされる、(c) `administrator` / `user` グループの権限が既定値にリセットされる。
- **方針**：同期は「欠けているものを作る」処理に限定する。
  - ユーザー：DBに存在しないユーザーのみ作成する。既存ユーザーは更新しない。新規作成時の `status` は `Enabled === false` なら `suspended`、それ以外は `active` とする。
  - ユーザーごとに呼んでいる未使用の `getCognitoGroups` 呼び出しを削除する（API呼び出し数削減）。
  - 権限：`administrator` / `user` の権限レコードが存在しない場合のみ既定値で作成する。既存レコードは更新しない（`DEFAULT_GROUP_PERMISSIONS` を `sort()` で破壊的に並べ替えている箇所も同時に解消）。
- **影響**：管理画面の「Cognito同期」の結果件数の意味が「作成件数」に変わる。

### #12 新規登録失敗時の招待コード焼失

- **現状**：[register.post.ts](../../server/api/public/register.post.ts) は二重登録防止のため先に招待コードを消費し、以降の失敗時に復元しない。既存メールアドレスでの `UsernameExistsException` でもコードが使えなくなる。
- **方針**：内側の `catch` でロールバックする。
  1. Cognitoユーザー作成後に失敗した場合は `AdminDeleteUser` をベストエフォートで実行する（作成前の失敗では実行しない）。
  2. 招待コードを `status = active` に戻す。条件は `consumed_by = 予約ID` とし、他リクエストの消費を巻き戻さないようにする。`invite-helpers.ts` に `releaseInvite(inviteCode, reservationId)` を追加する。
  3. ロールバック自体の失敗はログのみとし、元のエラーを返す。

### #13 グループ取得失敗時の予備処理の整理

- **現状**：[login.post.ts](../../server/api/auth/login.post.ts)、[session.ts](../../server/utils/session.ts) に、グループ取得失敗時の予備処理が残っている（現在は到達しない）。
- **方針**：予備処理を削除し、取得失敗時はグループなし（権限なし）とする。

### #14 ログインCookieの属性見直し

- **現状**：[login.post.ts](../../server/api/auth/login.post.ts) の Cookie 属性が環境によらず固定。
- **方針**：`secure: !import.meta.dev` とし、ローカル開発時のみ false にする。`process-auth-result.post.ts` も同じ判定に揃える（`sameSite` はそれぞれ現状維持）。
- **確認**：stg（Amplify, HTTPS）でログインできること。

### #15 全件scanの削減

- **方針**（スキーマ変更なしでできる範囲）：
  - [transaction-requests.get.ts:49](../../server/api/transaction-requests.get.ts) の `status=all` 分岐とフォールバック分岐：取引テーブル全件scanを `UserTimestampIndex` の query に置き換える。
  - [admin/transactions/index.get.ts](../../server/api/admin/transactions/index.get.ts)：ユーザー名付与のための `users` 全件scanをやめ、ページング後の表示対象分の `user_id` だけ取得する（重複除去して並列 `get`）。取引側の全件scanはGSI設計が必要なため現状維持。
  - 最新相場の取得（`market_rates` 全件scan→ソート）が5箇所に重複しているため、`server/utils/market-rate-helpers.ts` に `getLatestMarketRate()` / `getAllMarketRatesDesc()` として集約する。scan自体は現行スキーマでは避けられないため現状維持（レート固定運用のため件数は少ない想定）。

## 4. 低

### L1 承認待ちリクエストの重複防止の強化

- **現状**：[request.post.ts](../../server/api/transactions/request.post.ts) の承認待ちリクエストの重複チェックが、単一のクエリによる確認のみに依存している。
- **方針**：ユーザーレコードの `pending_request_id` をロックとして使う。
  - リクエスト作成：`TransactWrite` で「取引の Put」と「ユーザーの `SET pending_request_id = :id`（条件 `attribute_not_exists(pending_request_id)`）」を同時に実行する。条件失敗は 409。
  - 承認／却下（#3）：取引の状態更新と `REMOVE pending_request_id`（条件 `pending_request_id = :id`）を同一 `TransactWrite` で実行する。
  - 既存の query による重複チェックは、ロック導入前から残っている pending への対応として残す。
- **注意**：`DynamoDBService.transactWrite` の型に `ConditionExpression` / `ExpressionAttributeNames` 付きの Update が必要なため型を拡張する。

### L2 1日の回数制限

- **現状**：日付の区切りがサーバー時刻（UTC）で、JSTでは9:00切り替えになる。上限値は50だが、エラーメッセージとAPI仕様書（`api_specification.md:908`）は5回。
- **方針**：区切りをJSTの0:00にする（`Asia/Tokyo` 基準で当日0:00のUTC時刻を算出）。上限値は【要判断】。

### L3 相場日時のタイムゾーン

- **現状**：作成・編集ダイアログがタイムゾーンなしの `YYYY-MM-DDTHH:mm(:ss)` を送り、サーバー（UTC）で解釈するため9時間ずれる。`rate_id` もUTC解釈のエポック秒になる。
- **方針**：フロントで `new Date(入力値).toISOString()` に変換して送信し、サーバーは `new Date(timestamp).toISOString()` に正規化して保存する。編集ダイアログの初期値表示はローカル時刻に変換して表示する（現行どおり）。
- **既存データ**：タイムゾーンなしで保存済みのレコードは変換しない（レート固定運用のため影響は軽微）。#9 の「新旧timestamp一致判定」は正規化後の値で比較する。

### L4 招待コード失効の条件付き更新

- **方針**：`revokeInvite` に `ConditionExpression: #status = :active` を付け、失敗時は 409（有効なコードではない）を返す。ルート側の事前 `getInvite` による404判定は残す。

### L5 グループ削除時の権限レコード

- **方針**：[groups/[groupName]/index.delete.ts](../../server/api/admin/groups/[groupName]/index.delete.ts) で Cognito グループ削除成功後に `permissions` テーブルの該当レコードも削除する。

### L6 承認後のプロフィール変更

- 【要判断】（下記「5. 要判断事項」参照）。判断が出るまで実装は保留。

### L7 資産推移表の「全期間」

- **現状**：ダッシュボードの `balanceHistory` は直近30日分のみ生成しているため、「全期間」を選んでも30日分しか出ない。
- **方針**：【要判断】。

### L8 サブアカウント一覧の削除済み除外

- **方針**：[sub-accounts/index.get.ts](../../server/api/account/sub-accounts/index.get.ts) の query に `filterExpression: #status <> :deleted` を付ける。

## 5. 要判断事項

| ID | 論点 | 選択肢 | 推奨 |
|---|---|---|---|
| L2 | 1日のリクエスト上限 | (a) 実装どおり50回とし、メッセージと仕様書を50回に直す (b) 仕様書どおり5回に下げる | (a)。`doc/README.md` の「実装が正」ルールに合わせる |
| L6 | 承認済みユーザーのプロフィール変更 | (a) 変更時に `profile_approved=false` に戻す (b) 氏名・住所・電話の変更は不可にする (c) 現状維持（仕様とする） | (a)。ただし未承認中は入金リクエスト不可になるため、運用への影響を確認のうえ決定 |
| L7 | 資産推移表の「全期間」 | (a) サーバーで最初の取引日から日次履歴を生成する (b) 「全期間」の選択肢を削除する | (b)。(a) は取引が古いユーザーでレスポンスが肥大化するため |

## 6. 作業順序とコミット単位

1. #1（デバッグAPI削除）
2. #5（`DynamoDBService` の `limit` 仕様変更）＋呼び出し元の見直し、#6
3. #2・#4（`getAllPages` ヘルパー導入とフロント置き換え）
4. #3・L1（取引承認処理の整合性強化と重複防止）
5. #8、#13、#14（認証・権限まわり）
6. #9・L3（相場）
7. #10（一括処理）
8. #11（Cognito同期）
9. #12・L4（招待・登録）
10. #15、L5、L8、L2
11. 要判断事項の決定後に L6・L7

各項目を1コミットとし、コミットメッセージに項目IDを含める。

## 7. 検証

- 自動テストは未整備のため、各コミットで `npm run lint` と `npm run typecheck` を通す。
- stg環境で以下を手動確認する。
  - #2・#4：ユーザーを21人以上／相場を51件以上にした状態で、選択肢・一覧に全件が出る
  - #3：承認時の検証で不正な承認が 400／409 になる
  - #6：プロフィール未承認ユーザーがダッシュボードに表示・計上される
  - #9：同一相場を日時を変えずに2回続けて編集できる
  - #12：既存メールアドレスで登録失敗後、同じ招待コードが再利用できる
  - #14：stgでログイン・ログアウトできる
  - L1：承認待ちリクエストの重複が作成されず、承認／却下後に新規リクエストを作成できる
