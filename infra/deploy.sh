#!/bin/bash

# M・S CFD App Infrastructure Deployment Script
#
# ⚠️ 非推奨: CloudShellで実行する場合は cloudshell.sh を使うこと。
#
# このスクリプトには CloudShell 運用と相性の悪い挙動が2つある:
#   1. backend.hcl が無いと setup-backend.sh を自動実行する。backend.hcl は
#      git管理外のため CloudShell の新規セッションでは常に不在であり、
#      実行するたびに新しい state バケットが作られてしまう。
#   2. terraform.tfvars も git管理外のため example からコピーされ、
#      environment が常に dev になる。prod 用の backend.hcl と組み合わさると
#      prod の state に dev の構成を書き込む事故につながる。
#
# cloudshell.sh は環境名を引数で受け取り、backend.hcl と terraform.tfvars を
# 同じ値から生成することでこの乖離を防いでいる。

set -e

echo "🚀 M・S CFD App - Infrastructure Deployment"
echo "=============================================="

# 環境変数の設定
export AWS_REGION="${AWS_REGION:-ap-northeast-1}"
export PROJECT_NAME="${PROJECT_NAME:-futura}"
export ENVIRONMENT="${ENVIRONMENT:-dev}"

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 関数定義
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# AWS認証確認
check_aws_auth() {
    log_info "Checking AWS authentication..."
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        log_error "AWS authentication failed. Please run 'aws configure' first."
        exit 1
    fi
    
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local region=$(aws configure get region || echo $AWS_REGION)
    log_success "AWS authenticated - Account: $account_id, Region: $region"
}

# Terraform バージョン確認
check_terraform() {
    log_info "Checking Terraform installation..."
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform is not installed. Please install Terraform first."
        log_info "Visit: https://www.terraform.io/downloads"
        exit 1
    fi
    
    local tf_version=$(terraform version -json | jq -r '.terraform_version')
    log_success "Terraform version: $tf_version"
}

# backend.hcl の存在確認
check_backend() {
    if [ ! -f "backend.hcl" ]; then
        log_warning "backend.hcl not found. Setting up remote backend..."
        if [ -f "setup-backend.sh" ]; then
            chmod +x setup-backend.sh
            ./setup-backend.sh
        else
            log_error "setup-backend.sh not found. Please run setup manually."
            exit 1
        fi
    else
        log_success "Backend configuration found"
    fi
}

# terraform.tfvars の確認
check_tfvars() {
    if [ ! -f "terraform.tfvars" ]; then
        log_warning "terraform.tfvars not found. Creating from template..."
        cp terraform.tfvars.example terraform.tfvars
        log_info "Please edit terraform.tfvars with your specific values if needed."
    else
        log_success "terraform.tfvars found"
    fi
}

# メイン実行
main() {
    echo "🔍 Pre-deployment checks..."
    check_aws_auth
    check_terraform
    check_backend
    check_tfvars
    
    echo ""
    log_info "Starting Terraform deployment..."
    
    # Terraform 初期化
    log_info "Initializing Terraform..."
    terraform init -backend-config=backend.hcl
    log_success "Terraform initialized"
    
    # Terraform プラン
    log_info "Creating deployment plan..."
    terraform plan -out=tfplan
    log_success "Deployment plan created"
    
    # 確認プロンプト
    echo ""
    log_warning "Ready to deploy infrastructure. Continue? [y/N]"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled by user"
        exit 0
    fi
    
    # Terraform 実行
    log_info "Applying infrastructure changes..."
    terraform apply tfplan
    log_success "Infrastructure deployed successfully!"
    
    # クリーンアップ
    rm -f tfplan
    
    echo ""
    log_success "🎉 Deployment completed!"
    echo ""
    log_info "📋 Important outputs:"
    terraform output
    
    echo ""
    log_info "🔧 Next steps:"
    echo "  1. Copy the Cognito outputs to your Nuxt app environment variables"
    echo "  2. Test the authentication with the provided accounts:"
    echo "     - Admin: admin@example.com / TempAdmin123!"
    echo "     - User: user@example.com / TempUser123!"
    echo "  3. Run your Nuxt application: npm run dev"
}

# スクリプト実行
main "$@"