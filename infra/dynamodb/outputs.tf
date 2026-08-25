output "table_names" {
  description = "DynamoDB table names"
  value = {
    users            = aws_dynamodb_table.users.name
    transactions     = aws_dynamodb_table.transactions.name
    market_rates     = aws_dynamodb_table.market_rates.name
    sessions         = aws_dynamodb_table.sessions.name
    permissions      = aws_dynamodb_table.permissions.name
    batch_operations = aws_dynamodb_table.batch_operations.name
    segments         = aws_dynamodb_table.segments.name
    user_segments    = aws_dynamodb_table.user_segments.name
    invites          = aws_dynamodb_table.invites.name
  }
}

output "table_arns" {
  description = "DynamoDB table ARNs"
  value = {
    users            = aws_dynamodb_table.users.arn
    transactions     = aws_dynamodb_table.transactions.arn
    market_rates     = aws_dynamodb_table.market_rates.arn
    sessions         = aws_dynamodb_table.sessions.arn
    permissions      = aws_dynamodb_table.permissions.arn
    batch_operations = aws_dynamodb_table.batch_operations.arn
    segments         = aws_dynamodb_table.segments.arn
    user_segments    = aws_dynamodb_table.user_segments.arn
    invites          = aws_dynamodb_table.invites.arn
  }
}

output "users_table_name" {
  description = "Users table name"
  value       = aws_dynamodb_table.users.name
}

output "transactions_table_name" {
  description = "Transactions table name"
  value       = aws_dynamodb_table.transactions.name
}

output "market_rates_table_name" {
  description = "Market rates table name"
  value       = aws_dynamodb_table.market_rates.name
}

output "sessions_table_name" {
  description = "Sessions table name"
  value       = aws_dynamodb_table.sessions.name
}

output "permissions_table_name" {
  description = "Permissions table name"
  value       = aws_dynamodb_table.permissions.name
}

output "batch_operations_table_name" {
  description = "Batch operations table name"
  value       = aws_dynamodb_table.batch_operations.name
}

output "segments_table_name" {
  description = "Segments table name"
  value       = aws_dynamodb_table.segments.name
}

output "user_segments_table_name" {
  description = "User segments table name"
  value       = aws_dynamodb_table.user_segments.name
}

output "invites_table_name" {
  description = "Invites table name"
  value       = aws_dynamodb_table.invites.name
}