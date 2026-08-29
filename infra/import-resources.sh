#!/bin/bash
set -e

PROJECT_NAME="${PROJECT_NAME:-futura}"
ENVIRONMENT="${ENVIRONMENT:-dev}"

echo "Importing existing AWS resources into Terraform state..."

# Get AWS Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# DynamoDB Tables
echo "Importing DynamoDB tables..."
terraform import 'module.dynamodb.aws_dynamodb_table.users' "${PROJECT_NAME}-${ENVIRONMENT}-users" 2>/dev/null || echo "  users already imported or not found"
terraform import 'module.dynamodb.aws_dynamodb_table.transactions' "${PROJECT_NAME}-${ENVIRONMENT}-transactions" 2>/dev/null || echo "  transactions already imported or not found"
terraform import 'module.dynamodb.aws_dynamodb_table.market_rates' "${PROJECT_NAME}-${ENVIRONMENT}-market-rates" 2>/dev/null || echo "  market_rates already imported or not found"
terraform import 'module.dynamodb.aws_dynamodb_table.sessions' "${PROJECT_NAME}-${ENVIRONMENT}-sessions" 2>/dev/null || echo "  sessions already imported or not found"
terraform import 'module.dynamodb.aws_dynamodb_table.permissions' "${PROJECT_NAME}-${ENVIRONMENT}-permissions" 2>/dev/null || echo "  permissions already imported or not found"

# DynamoDB Table Items
echo "Importing DynamoDB table items..."
terraform import 'module.dynamodb.aws_dynamodb_table_item.administrator_permissions' "${PROJECT_NAME}-${ENVIRONMENT}-permissions|group_name=administrator" 2>/dev/null || echo "  administrator_permissions item already imported or not found"

# S3 Bucket and related resources
echo "Importing S3 resources..."
terraform import 'module.s3.aws_s3_bucket.uploads' "${PROJECT_NAME}-${ENVIRONMENT}-uploads" 2>/dev/null || echo "  S3 bucket already imported or not found"
terraform import 'module.s3.aws_s3_bucket_public_access_block.uploads' "${PROJECT_NAME}-${ENVIRONMENT}-uploads" 2>/dev/null || echo "  S3 public access block already imported or not found"
terraform import 'module.s3.aws_s3_bucket_cors_configuration.uploads' "${PROJECT_NAME}-${ENVIRONMENT}-uploads" 2>/dev/null || echo "  S3 CORS already imported or not found"
terraform import 'module.s3.aws_s3_bucket_lifecycle_configuration.uploads' "${PROJECT_NAME}-${ENVIRONMENT}-uploads" 2>/dev/null || echo "  S3 lifecycle already imported or not found"

# IAM Resources
echo "Importing IAM resources..."
terraform import 'module.iam.aws_iam_role.lambda_execution' "${PROJECT_NAME}-${ENVIRONMENT}-lambda-execution-role" 2>/dev/null || echo "  IAM role already imported or not found"
terraform import 'module.iam.aws_iam_policy.dynamodb_access' "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-dynamodb-access" 2>/dev/null || echo "  dynamodb_access policy already imported or not found"
terraform import 'module.iam.aws_iam_policy.s3_access' "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-s3-access" 2>/dev/null || echo "  s3_access policy already imported or not found"
terraform import 'module.iam.aws_iam_policy.cognito_access' "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-cognito-access" 2>/dev/null || echo "  cognito_access policy already imported or not found"
terraform import 'module.iam.aws_iam_policy.cloudwatch_logs' "arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-cloudwatch-logs" 2>/dev/null || echo "  cloudwatch_logs policy already imported or not found"

# IAM Policy Attachments
echo "Importing IAM policy attachments..."
terraform import 'module.iam.aws_iam_role_policy_attachment.lambda_dynamodb' "${PROJECT_NAME}-${ENVIRONMENT}-lambda-execution-role/arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-dynamodb-access" 2>/dev/null || echo "  lambda_dynamodb attachment already imported or not found"
terraform import 'module.iam.aws_iam_role_policy_attachment.lambda_s3' "${PROJECT_NAME}-${ENVIRONMENT}-lambda-execution-role/arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-s3-access" 2>/dev/null || echo "  lambda_s3 attachment already imported or not found"
terraform import 'module.iam.aws_iam_role_policy_attachment.lambda_cognito' "${PROJECT_NAME}-${ENVIRONMENT}-lambda-execution-role/arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-cognito-access" 2>/dev/null || echo "  lambda_cognito attachment already imported or not found"
terraform import 'module.iam.aws_iam_role_policy_attachment.lambda_cloudwatch' "${PROJECT_NAME}-${ENVIRONMENT}-lambda-execution-role/arn:aws:iam::${ACCOUNT_ID}:policy/${PROJECT_NAME}-${ENVIRONMENT}-cloudwatch-logs" 2>/dev/null || echo "  lambda_cloudwatch attachment already imported or not found"

# Lambda Resources
echo "Importing Lambda resources..."
terraform import 'module.lambda.aws_cloudwatch_log_group.nuxt_app' "/aws/lambda/${PROJECT_NAME}-${ENVIRONMENT}-nuxt-app" 2>/dev/null || echo "  log group already imported or not found"
terraform import 'module.lambda.aws_lambda_function.api_handler' "${PROJECT_NAME}-${ENVIRONMENT}-api-handler" 2>/dev/null || echo "  Lambda function already imported or not found"
terraform import 'module.lambda.aws_lambda_permission.api_gateway_invoke' "${PROJECT_NAME}-${ENVIRONMENT}-api-handler/AllowExecutionFromAPIGateway" 2>/dev/null || echo "  Lambda permission already imported or not found"

echo ""
echo "✅ Import completed!"
echo ""
echo "Next steps:"
echo "  1. Run: terraform plan"
echo "  2. Review the changes"
echo "  3. Run: terraform apply"
