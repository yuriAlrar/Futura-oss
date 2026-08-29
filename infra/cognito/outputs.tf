output "user_pool_id" {
  description = "Cognito ユーザープールID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito ユーザープールARN"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_client_id" {
  description = "Cognito ユーザープールクライアントID"
  value       = aws_cognito_user_pool_client.main.id
}

output "administrator_group_name" {
  description = "管理者グループ名"
  value       = aws_cognito_user_group.administrator.name
}

output "admin_user_email" {
  description = "初期管理者ユーザーのメールアドレス"
  value       = aws_cognito_user.admin.attributes.email
}