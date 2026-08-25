# Lambda execution role
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-${var.environment}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-lambda-execution-role"
  }
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution.name
}

# DynamoDB access policy
resource "aws_iam_policy" "dynamodb_access" {
  name        = "${var.project_name}-${var.environment}-dynamodb-access"
  description = "Policy for DynamoDB access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactWriteItems",
          "dynamodb:TransactGetItems",
          "dynamodb:DescribeTable",
          "dynamodb:ListTables"
        ]
        Resource = [
          for arn in values(var.dynamodb_table_arns) : arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          for arn in values(var.dynamodb_table_arns) : "${arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb_access" {
  policy_arn = aws_iam_policy.dynamodb_access.arn
  role       = aws_iam_role.lambda_execution.name
}

# S3 access policy
# Grants access to the specific S3 bucket specified via terraform.tfvars (uploads_bucket_name)
resource "aws_iam_policy" "s3_access" {
  name        = "${var.project_name}-${var.environment}-s3-access"
  description = "Policy for S3 access to the uploads bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = var.s3_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3_access" {
  policy_arn = aws_iam_policy.s3_access.arn
  role       = aws_iam_role.lambda_execution.name
}

# Cognito access policy
resource "aws_iam_policy" "cognito_access" {
  name        = "${var.project_name}-${var.environment}-cognito-access"
  description = "Policy for Cognito access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          # User management
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminResetUserPassword",

          # User listing and retrieval
          "cognito-idp:ListUsers",
          "cognito-idp:GetUser",

          # Group management
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:ListUsersInGroup",
          "cognito-idp:ListGroups",
          "cognito-idp:GetGroup",
          "cognito-idp:CreateGroup",
          "cognito-idp:DeleteGroup",
          "cognito-idp:UpdateGroup",

          # Authentication
          "cognito-idp:InitiateAuth",
          "cognito-idp:RespondToAuthChallenge",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",

          # User Pool information
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient"
        ]
        Resource = var.cognito_user_pool_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_cognito_access" {
  policy_arn = aws_iam_policy.cognito_access.arn
  role       = aws_iam_role.lambda_execution.name
}

# CloudWatch Logs policy (additional permissions)
resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${var.project_name}-${var.environment}-cloudwatch-logs"
  description = "Policy for CloudWatch Logs access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_cloudwatch_logs" {
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
  role       = aws_iam_role.lambda_execution.name
}

# Amplify Hosting SSR Compute role
#
# server/api/**（Nitroの'aws-amplify'プリセットで動くAPIルート）は、この
# ロールを通じてDynamoDB/Cognitoにアクセスする。lambda_executionロールは
# 未使用のプレースホルダーLambda用のため、Amplify Hostingの実行環境には
# 適用されない。作成後、Amplifyコンソール（App settings > IAM roles >
# Compute role）でこのロールのARNをアプリに手動で紐付ける必要がある
# （Amplify AppはTerraform管理外のため）。
resource "aws_iam_role" "amplify_ssr_compute" {
  name = "${var.project_name}-${var.environment}-amplify-ssr-compute-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-${var.environment}-amplify-ssr-compute-role"
  }
}

resource "aws_iam_role_policy_attachment" "amplify_ssr_compute_dynamodb_access" {
  policy_arn = aws_iam_policy.dynamodb_access.arn
  role       = aws_iam_role.amplify_ssr_compute.name
}

resource "aws_iam_role_policy_attachment" "amplify_ssr_compute_s3_access" {
  policy_arn = aws_iam_policy.s3_access.arn
  role       = aws_iam_role.amplify_ssr_compute.name
}

resource "aws_iam_role_policy_attachment" "amplify_ssr_compute_cognito_access" {
  policy_arn = aws_iam_policy.cognito_access.arn
  role       = aws_iam_role.amplify_ssr_compute.name
}