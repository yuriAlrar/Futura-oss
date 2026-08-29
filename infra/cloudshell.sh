#!/bin/bash
#
# AWS CloudShell からインフラをデプロイするためのスクリプト。
#
#   ./cloudshell.sh deploy <env>   Terraform の init → plan → 確認 → apply → output
#   ./cloudshell.sh plan   <env>   plan のみ（applyしない）
#   ./cloudshell.sh output <env>   既存環境の output を表示
#   ./cloudshell.sh seed   <env>   初期マスタデータ（権限・相場）をDynamoDBに投入
#
#   <env> は dev / stg / prod のいずれか。
#   ブランチ対応: prod→main / stg→stg
#
# 設計上の注意:
#   環境名を1箇所（引数）から backend.hcl と terraform.tfvars の両方に流している。
#   これは deploy.sh のように両者が別経路で決まると、prod の state に dev の構成を
#   書き込む事故が起きうるため。環境の指定はこのスクリプトでは常に引数が正となる。
#
#   state バケットは自動検出のみ行い、作成はしない。setup-backend.sh は実行するたび
#   別名のバケットを作るため、既存環境があるときに走らせると state を見失うため。

set -euo pipefail

cd "$(dirname "$0")"

readonly TERRAFORM_VERSION="1.7.5"   # infra/buildspec.yml と揃えること
readonly PROJECT_NAME="${PROJECT_NAME:-futura}"
readonly AWS_REGION="${AWS_REGION:-us-east-1}"

# CodeCommitリポジトリは全環境で1つを共有し、環境をブランチで分ける運用。
# チェックアウト中のブランチがそのまま適用対象のインフラコードになる。
# prod だけブランチ名（main）と環境名がずれるため、対応はこの関数に集約する。
expected_branch_for() {
    case "$1" in
        prod) echo "main" ;;
        stg)  echo "stg" ;;
        *)    echo "" ;;   # dev は専用ブランチを持たない
    esac
}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
# 診断出力はすべて stderr に出す。detect_state_bucket のように結果を
# コマンド置換で受け取る関数があるため、stdout に混ぜると戻り値が壊れる。
log_info()    { echo -e "${BLUE}ℹ️  $1${NC}" >&2; }
log_success() { echo -e "${GREEN}✅ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}" >&2; }
log_error()   { echo -e "${RED}❌ $1${NC}" >&2; }

usage() {
    cat << 'USAGE'
AWS CloudShell からインフラをデプロイするためのスクリプト。

  ./cloudshell.sh deploy <env>   Terraform の init → plan → 確認 → apply → output
  ./cloudshell.sh plan   <env>   plan のみ（applyしない）
  ./cloudshell.sh output <env>   既存環境の output を表示
  ./cloudshell.sh seed   <env>   初期マスタデータ（権限・相場）をDynamoDBに投入

  <env> は dev / stg / prod のいずれか。

ブランチ対応（リポジトリは全環境で1つを共有し、環境はブランチで分ける）:
  prod → main
  stg  → stg
  dev  → 対応ブランチなし

環境変数での上書き:
  DEPLOY_BRANCH        想定ブランチを上書き（既定: prod→main / stg→stg）
  TF_STATE_BUCKET      state バケットを明示（複数見つかる場合に必要）
  UPLOADS_BUCKET_NAME  S3アップロードバケット名のカスタマイズ
  PROJECT_NAME         既定: futura
  AWS_REGION           既定: us-east-1
USAGE
    exit 1
}

# ---------------------------------------------------------------- 事前チェック

validate_env() {
    case "$1" in
        dev|stg|prod) ;;
        *) log_error "環境名は dev / stg / prod のいずれかです（指定値: '$1'）"
           log_info  "'staging' は infra/variables.tf のバリデーションで弾かれます"
           exit 1 ;;
    esac
}

# 対象環境に対して想定外のブランチに居ないかを確認する。
# リポジトリが環境ごとに分かれていないため、ディレクトリ名による目印が無く、
# ブランチの取り違えに気づく手段がこれしかない。
# 想定ブランチに居れば 0、違えば 1 を返す。
check_branch() {
    local env="$1"
    git rev-parse --git-dir > /dev/null 2>&1 || return 0

    if ! git diff --quiet HEAD 2>/dev/null; then
        log_warning "コミットされていない変更があります。作業ツリーの内容がそのまま適用されます"
    fi

    local expected current
    expected="${DEPLOY_BRANCH:-$(expected_branch_for "$env")}"
    current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

    if [ -z "$expected" ]; then
        log_warning "環境 '${env}' には対応ブランチが定義されていません（現在: '${current}'）"
        return 0
    fi
    if [ -z "$current" ] || [ "$current" = "$expected" ]; then
        return 0
    fi

    log_warning "環境 '${env}' の想定ブランチは '${expected}' ですが、現在は '${current}' です"
    log_warning "リポジトリは全環境で共有のため、このブランチのインフラコードが ${env} に適用されます"
    return 1
}

check_aws_auth() {
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS認証に失敗しました。CloudShellで実行しているか確認してください"
        exit 1
    fi
    local arn; arn=$(aws sts get-caller-identity --query Arn --output text)
    log_success "AWS認証OK: $arn"
}

# CloudShell には Terraform が入っていないため、$HOME/bin に導入する。
# $HOME は 1GB の永続ストレージなのでセッションをまたいで残る。
ensure_terraform() {
    if command -v terraform > /dev/null 2>&1; then
        local current; current=$(terraform version -json | jq -r '.terraform_version')
        if [ "$current" = "$TERRAFORM_VERSION" ]; then
            log_success "Terraform $current"
            return
        fi
        log_warning "Terraform $current が入っていますが、想定は $TERRAFORM_VERSION です"
        log_warning "provider解決やstateの互換性に差異が出る可能性があります"
        return
    fi

    log_info "Terraform $TERRAFORM_VERSION を \$HOME/bin に導入します..."
    local arch; arch=$(uname -m)
    case "$arch" in
        x86_64)  arch="amd64" ;;
        aarch64) arch="arm64" ;;
        *) log_error "未対応のアーキテクチャ: $arch"; exit 1 ;;
    esac

    mkdir -p "$HOME/bin"
    local zip="terraform_${TERRAFORM_VERSION}_linux_${arch}.zip"
    curl -sLo "/tmp/$zip" "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/${zip}"
    unzip -oq "/tmp/$zip" -d "$HOME/bin" && rm -f "/tmp/$zip"
    export PATH="$HOME/bin:$PATH"

    if ! grep -q 'HOME/bin' "$HOME/.bashrc" 2>/dev/null; then
        echo 'export PATH=$HOME/bin:$PATH' >> "$HOME/.bashrc"
    fi
    log_success "Terraform $(terraform version -json | jq -r '.terraform_version') を導入しました"
}

# state バケットは「検出するだけ」。作成は setup-backend.sh の責務で、
# 既存バケットがある状態で走らせると別バケットを作ってしまうため呼ばない。
detect_state_bucket() {
    if [ -n "${TF_STATE_BUCKET:-}" ]; then
        echo "$TF_STATE_BUCKET"; return
    fi

    local found count
    found=$(aws s3api list-buckets \
        --query "Buckets[?starts_with(Name, '${PROJECT_NAME}-terraform-state-')].Name" \
        --output text 2>/dev/null || true)
    count=$(echo "$found" | wc -w)

    if [ "$count" -eq 0 ]; then
        log_error "Terraform state バケットが見つかりません"
        log_info "アカウントで初回のみ、以下を実行してバケットを作成してください:"
        log_info "  ENVIRONMENT=<env> ./setup-backend.sh"
        log_warning "既に環境がある場合は絶対に実行しないでください（別バケットが作られます）"
        exit 1
    elif [ "$count" -gt 1 ]; then
        # setup-backend.sh を複数回実行すると孤立バケットが残る。どれが現用かを
        # 誤ると別の state を掴むため、中身を並べて示したうえで明示を要求する。
        log_error "state バケットが複数見つかりました。どれを使うか明示してください:"
        {
            echo ""
            for b in $found; do
                echo "  📦 $b"
                aws s3 ls "s3://$b" --recursive 2>/dev/null \
                    | awk '{printf "       %s  %s (%s bytes)\n", $4, $1, $3}' \
                    || echo "       (空、またはアクセス不可)"
            done
            echo ""
        } >&2
        log_info "対象環境の state を含むバケットを選び、次のように指定してください:"
        log_info "  export TF_STATE_BUCKET=<bucket-name>"
        log_info "CloudShellで毎回指定するのが面倒なら ~/.bashrc に export を追記してください"
        exit 1
    fi
    echo "$found"
}

# backend.hcl と terraform.tfvars を環境名から生成する。
# 両者を必ず同じ引数から作ることで、state の向き先と構成の環境が食い違う事故を防ぐ。
write_config() {
    local env="$1" bucket="$2"

    cat > backend.hcl << EOF
bucket  = "${bucket}"
key     = "${PROJECT_NAME}/${env}/terraform.tfstate"
region  = "${AWS_REGION}"
encrypt = true
EOF

    cat > terraform.tfvars << EOF
aws_region   = "${AWS_REGION}"
environment  = "${env}"
project_name = "${PROJECT_NAME}"
EOF
    # 'A && B' 形式にすると、関数の最終文になった瞬間に set -e で落ちるため if を使う
    if [ -n "${UPLOADS_BUCKET_NAME:-}" ]; then
        echo "uploads_bucket_name = \"${UPLOADS_BUCKET_NAME}\"" >> terraform.tfvars
        log_info "  S3アップロードバケット名: ${UPLOADS_BUCKET_NAME}"
    fi

    log_success "backend.hcl / terraform.tfvars を生成しました（environment=${env}）"
    log_info "  state: s3://${bucket}/${PROJECT_NAME}/${env}/terraform.tfstate"
}

# ---------------------------------------------------------------- サブコマンド

do_plan() {
    local env="$1"
    terraform init -backend-config=backend.hcl -reconfigure -input=false
    echo ""
    log_info "デプロイ計画を作成しています..."
    terraform plan -out=tfplan -input=false
}

# plan に削除・置換が含まれるかを判定する。新規構築なら作成のみのはずで、
# 削除が出る場合は backend.hcl の key 指定ミスで別環境の state を掴んでいる疑いが強い。
warn_if_destructive() {
    local env="$1" destroyed
    destroyed=$(terraform show -json tfplan \
        | jq -r '[.resource_changes[]? | select(.change.actions[]? | . == "delete")] | length')

    if [ "$destroyed" -gt 0 ]; then
        echo ""
        log_warning "════════════════════════════════════════════════════"
        log_warning " この plan には ${destroyed} 件の削除・置換が含まれます"
        log_warning "════════════════════════════════════════════════════"
        log_warning "新規環境の構築なら、削除は発生しないはずです。"
        log_warning "backend.hcl の key が別環境を指していないか確認してください:"
        grep '^key' backend.hcl | sed 's/^/    /'
        echo ""
        log_warning "続行するには環境名 '${env}' を入力してください（中止はEnter）:"
        read -r confirm
        if [ "$confirm" != "$env" ]; then
            log_info "中止しました"
            rm -f tfplan
            exit 0
        fi
    fi
}

do_deploy() {
    local env="$1"
    do_plan "$env"
    warn_if_destructive "$env"

    echo ""
    log_warning "上記の内容で ${env} 環境に適用します。よろしいですか? [y/N]"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "中止しました"
        rm -f tfplan
        exit 0
    fi

    terraform apply -input=false tfplan
    rm -f tfplan
    log_success "🎉 ${env} 環境へのデプロイが完了しました"

    echo ""
    log_info "📋 出力値:"
    terraform output
    echo ""
    log_info "🔧 次の手順:"
    echo "  1. ./cloudshell.sh seed ${env}  で初期マスタデータを投入"
    echo "  2. Amplifyコンソールで Compute role に amplify_ssr_compute_role_arn を割り当て"
    echo "  3. Amplify環境変数に STAGE / Cognito の User Pool ID・Client ID を設定"
    echo "  詳細: doc/guides/deployment_runbook.md"
}

# 権限一覧の正本は server/utils/permission-definitions.ts の DEFAULT_GROUP_PERMISSIONS。
# ここに値を複製すると、正本に権限が追加されたとき黙って古くなり、
# 新しい権限が administrator グループに入らないまま環境が作られる。
# そのため seed 時に正本から抽出する。
readonly PERMISSION_SRC="../server/utils/permission-definitions.ts"

# administrator は「全権限」。categories 配下の key をすべて拾う
# （正本の administrator はゲッターで allPermissions を返すため、同じ計算を再現する）。
extract_admin_permissions() {
    sed -n '/^  categories: {/,/^  get allPermissions/p' "$PERMISSION_SRC" \
        | grep -o "key: '[^']*'" | sed "s/key: '//; s/'$//"
}

# user は DEFAULT_GROUP_PERMISSIONS.user の配列リテラル。
extract_user_permissions() {
    sed -n '/^export const DEFAULT_GROUP_PERMISSIONS/,/^}/p' "$PERMISSION_SRC" \
        | sed -n '/^  user: \[/,/\]/p' \
        | grep -o "'[^']*'" | tr -d "'"
}

# 改行区切りの権限キーを DynamoDB の文字列リスト JSON に変換する。
to_dynamo_list() {
    local first=1 out="["
    while read -r key; do
        [ -z "$key" ] && continue
        [ "$first" -eq 0 ] && out="${out},"
        out="${out}{\"S\":\"${key}\"}"
        first=0
    done
    echo "${out}]"
}

# 初期マスタデータ。DynamoDBテーブルはTerraformが作るが、以下のレコードは
# アプリ運用上の初期データのため意図的にTerraform管理外としている。
#
# put-item を使うためレコード全体が上書きされる。権限追加時の再実行にも使えるが、
# 管理画面でグループ権限をカスタマイズしている環境では、その変更が正本の内容で
# 置き換わる点に注意。
do_seed() {
    local env="$1"
    local perm_table="${PROJECT_NAME}-${env}-permissions"
    local rate_table="${PROJECT_NAME}-${env}-market-rates"
    local now; now=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

    for t in "$perm_table" "$rate_table"; do
        if ! aws dynamodb describe-table --table-name "$t" > /dev/null 2>&1; then
            log_error "テーブル $t が存在しません。先に deploy を実行してください"
            exit 1
        fi
    done

    if [ ! -f "$PERMISSION_SRC" ]; then
        log_error "権限定義の正本が見つかりません: $PERMISSION_SRC"
        log_info  "リポジトリ全体をcloneした状態で infra/ から実行してください"
        exit 1
    fi

    local admin_perms user_perms admin_count user_count
    admin_perms=$(extract_admin_permissions)
    user_perms=$(extract_user_permissions)
    admin_count=$(echo "$admin_perms" | grep -c . || true)
    user_count=$(echo "$user_perms" | grep -c . || true)

    # 抽出に失敗しても気づけるよう、投入前に妥当性を確認する。
    if [ "$admin_count" -eq 0 ] || [ "$user_count" -eq 0 ]; then
        log_error "権限定義の抽出に失敗しました（administrator=${admin_count}件 / user=${user_count}件）"
        log_info  "$PERMISSION_SRC の構造が変わった可能性があります"
        exit 1
    fi
    while read -r key; do
        [ -z "$key" ] && continue
        if ! echo "$admin_perms" | grep -qx "$key"; then
            log_error "user権限 '${key}' が全権限一覧に存在しません。正本の抽出結果が不整合です"
            exit 1
        fi
    done <<< "$user_perms"

    log_success "権限定義を抽出しました: administrator=${admin_count}件 / user=${user_count}件"

    log_warning "既存の権限レコードは上書きされます（管理画面でのカスタマイズは失われます）"
    log_info "権限レコードを投入します: $perm_table"
    aws dynamodb put-item --table-name "$perm_table" --item "{
      \"group_name\": {\"S\": \"administrator\"},
      \"permissions\": {\"L\": $(echo "$admin_perms" | to_dynamo_list)},
      \"description\": {\"S\": \"Full system administrator permissions - all features accessible\"},
      \"created_at\": {\"S\": \"${now}\"},
      \"updated_at\": {\"S\": \"${now}\"}
    }"

    aws dynamodb put-item --table-name "$perm_table" --item "{
      \"group_name\": {\"S\": \"user\"},
      \"permissions\": {\"L\": $(echo "$user_perms" | to_dynamo_list)},
      \"description\": {\"S\": \"Standard user permissions\"},
      \"created_at\": {\"S\": \"${now}\"},
      \"updated_at\": {\"S\": \"${now}\"}
    }"

    # 円建て運用のため相場は固定値1件。管理画面側も編集を無効化している。
    log_info "相場レコード（1BTC=1JPY固定）を投入します: $rate_table"
    aws dynamodb put-item --table-name "$rate_table" --item '{
      "rate_id": {"S": "1704067200"},
      "timestamp": {"S": "2024-01-01T00:00:00.000Z"},
      "btc_jpy_rate": {"N": "1"},
      "created_by": {"S": "system"},
      "created_at": {"S": "2024-01-01T00:00:00.000Z"}
    }'

    log_success "初期データの投入が完了しました"
}

# ---------------------------------------------------------------- エントリポイント

main() {
    [ $# -lt 2 ] && usage
    local cmd="$1" env="$2"

    validate_env "$env"
    check_aws_auth

    case "$cmd" in
        seed)
            do_seed "$env"
            ;;
        deploy|plan|output)
            # ブランチの取り違えはローカルで即判定できるので、
            # Terraform導入やAWSへの問い合わせより先に確認する。
            if [ "$cmd" != "output" ] && ! check_branch "$env" && [ "$cmd" = "deploy" ]; then
                log_warning "このブランチのまま ${env} へデプロイしますか? [y/N]"
                read -r branch_ok
                if [[ ! "$branch_ok" =~ ^[Yy]$ ]]; then
                    log_info "中止しました。'git checkout $(expected_branch_for "$env")' してから再実行してください"
                    exit 0
                fi
            fi

            ensure_terraform
            local bucket; bucket=$(detect_state_bucket)
            write_config "$env" "$bucket"
            case "$cmd" in
                deploy) do_deploy "$env" ;;
                plan)   do_plan "$env"
                        rm -f tfplan
                        log_info "plan のみ実行しました。適用するには deploy を使ってください" ;;
                output) terraform init -backend-config=backend.hcl -reconfigure -input=false > /dev/null
                        terraform output ;;
            esac
            ;;
        *)
            log_error "不明なコマンド: $cmd"
            usage
            ;;
    esac
}

main "$@"
