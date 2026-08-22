output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda_execution.arn
}

output "lambda_execution_role_name" {
  description = "Lambda execution role name"
  value       = aws_iam_role.lambda_execution.name
}

output "dynamodb_access_policy_arn" {
  description = "DynamoDB access policy ARN"
  value       = aws_iam_policy.dynamodb_access.arn
}

output "s3_access_policy_arn" {
  description = "S3 access policy ARN"
  value       = aws_iam_policy.s3_access.arn
}

output "cognito_access_policy_arn" {
  description = "Cognito access policy ARN"
  value       = aws_iam_policy.cognito_access.arn
}

output "amplify_ssr_compute_role_arn" {
  description = "IAM role ARN to attach as the Amplify Hosting SSR Compute role (App settings > IAM roles > Compute role)"
  value       = aws_iam_role.amplify_ssr_compute.arn
}