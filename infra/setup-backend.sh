#!/bin/bash

# Terraform S3 Backend Setup Script
# パブリックリポジトリ用のセキュアなバックエンド構築

set -e

echo "🚀 M・S CFD App - Terraform Backend Setup"
echo "=================================================="

# 環境変数の確認
if [ -z "$AWS_REGION" ]; then
    export AWS_REGION="us-east-1"
fi

if [ -z "$PROJECT_NAME" ]; then
    export PROJECT_NAME="futura"
fi

if [ -z "$ENVIRONMENT" ]; then
    export ENVIRONMENT="dev"
fi

# 一意なバケット名生成（アカウントIDとランダム文字列）
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
RANDOM_SUFFIX=$(date +%s | sha256sum | cut -c1-8)
BUCKET_NAME="${PROJECT_NAME}-terraform-state-${ACCOUNT_ID}-${RANDOM_SUFFIX}"

echo "📝 Configuration:"
echo "  AWS Region: $AWS_REGION"
echo "  Project: $PROJECT_NAME"
echo "  Environment: $ENVIRONMENT"
echo "  S3 Bucket: $BUCKET_NAME"
echo ""

# S3バケット作成
echo "🪣 Creating S3 bucket for Terraform state..."
# us-east-1 は S3 のデフォルトリージョンであり、LocationConstraint を明示すると
# 「The specified location-constraint is not valid」で失敗する。他リージョンでは必須。
if [ "$AWS_REGION" = "us-east-1" ]; then
    aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$AWS_REGION"
else
    aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION"
fi

# S3バケットの暗号化有効化
echo "🔐 Enabling S3 bucket encryption..."
aws s3api put-bucket-encryption \
    --bucket "$BUCKET_NAME" \
    --server-side-encryption-configuration '{
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                }
            }
        ]
    }'

# S3バケットのパブリックアクセスブロック
echo "🚫 Blocking public access to S3 bucket..."
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# S3バケットのバージョニング有効化
echo "📚 Enabling S3 bucket versioning..."
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled

# backend.hcl ファイル作成
echo "📄 Creating backend configuration..."
cat > backend.hcl << EOF
bucket  = "$BUCKET_NAME"
key     = "$PROJECT_NAME/$ENVIRONMENT/terraform.tfstate"
region  = "$AWS_REGION"
encrypt = true
EOF

echo ""
echo "✅ Backend setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Run: terraform init -backend-config=backend.hcl"
echo "  2. Run: terraform plan"
echo "  3. Run: terraform apply"
echo ""
echo "🔧 Backend configuration saved to: backend.hcl"
echo "⚠️  Remember: backend.hcl contains sensitive info, keep it out of git!"
echo ""