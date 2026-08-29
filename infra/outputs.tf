output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = module.cognito.user_pool_client_id
}

output "s3_bucket_name" {
  description = "S3 bucket name for file uploads"
  value       = module.s3.bucket_name
}

output "dynamodb_table_names" {
  description = "DynamoDB table names"
  value       = module.dynamodb.table_names
}

output "lambda_function_arns" {
  description = "Lambda function ARNs"
  value       = module.lambda.function_arns
}

output "amplify_ssr_compute_role_arn" {
  description = "IAM role ARN to attach as the Amplify Hosting SSR Compute role"
  value       = module.iam.amplify_ssr_compute_role_arn
}

output "administrator_group_name" {
  description = "Administrator group name"
  value       = module.cognito.administrator_group_name
}

output "admin_user_email" {
  description = "Administrator user email"
  value       = module.cognito.admin_user_email
}