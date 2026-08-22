# Users Table
resource "aws_dynamodb_table" "users" {
  name           = "${var.project_name}-${var.environment}-users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "parent_user_id"
    type = "S"
  }

  # GSI for looking up sub-accounts belonging to a parent (main) account
  global_secondary_index {
    name            = "ParentUserIndex"
    hash_key        = "parent_user_id"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-users"
  }
}

# Transactions Table
resource "aws_dynamodb_table" "transactions" {
  name           = "${var.project_name}-${var.environment}-transactions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "transaction_id"
  range_key      = "user_id"

  attribute {
    name = "transaction_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "requested_at"
    type = "S"
  }

  # GSI for user_id + timestamp queries
  global_secondary_index {
    name            = "UserTimestampIndex"
    hash_key        = "user_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI for status-based queries (承認待ちリクエスト一覧)
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "requested_at"
    projection_type = "ALL"
  }

  # GSI for user + status queries (ユーザー別状態別取引)
  global_secondary_index {
    name            = "TransactionUserStatusIndex"
    hash_key        = "user_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-transactions"
  }
}

# Market Rates Table
resource "aws_dynamodb_table" "market_rates" {
  name           = "${var.project_name}-${var.environment}-market-rates"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "rate_id"
  range_key      = "timestamp"

  attribute {
    name = "rate_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  # GSI for timestamp-based queries
  global_secondary_index {
    name            = "TimestampIndex"
    hash_key        = "timestamp"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-market-rates"
  }
}

# Sessions Table
resource "aws_dynamodb_table" "sessions" {
  name           = "${var.project_name}-${var.environment}-sessions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "session_id"

  attribute {
    name = "session_id"
    type = "S"
  }

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "login_time"
    type = "S"
  }

  # GSI for user_id + status queries (for invalidateAllUserSessions)
  global_secondary_index {
    name            = "UserStatusIndex"
    hash_key        = "user_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  # GSI for user_id + login_time queries (for getUserSessions)
  global_secondary_index {
    name            = "UserTimestampIndex"
    hash_key        = "user_id"
    range_key       = "login_time"
    projection_type = "ALL"
  }

  # TTL for automatic session cleanup
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-sessions"
  }
}

# Permissions Table
resource "aws_dynamodb_table" "permissions" {
  name           = "${var.project_name}-${var.environment}-permissions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "group_name"

  attribute {
    name = "group_name"
    type = "S"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-permissions"
  }
}

# Initial permissions data for administrator group
# Note: This item already exists in DynamoDB and is managed outside of Terraform
# to avoid conflicts. Update permissions manually or via application code.
#
# resource "aws_dynamodb_table_item" "administrator_permissions" {
#   table_name = aws_dynamodb_table.permissions.name
#   hash_key   = aws_dynamodb_table.permissions.hash_key
#
#   item = jsonencode({
#     group_name = {
#       S = "administrator"
#     }
#     permissions = {
#       L = [
#         { S = "user:create" },
#         { S = "user:read" },
#         { S = "user:update" },
#         { S = "user:delete" },
#         { S = "admin:access" },
#         { S = "group:create" },
#         { S = "group:read" },
#         { S = "group:update" },
#         { S = "group:delete" },
#         { S = "transaction:create" },
#         { S = "transaction:read" },
#         { S = "transaction:request" },
#         { S = "transaction:approve" },
#         { S = "market_rate:create" },
#         { S = "market_rate:read" },
#         { S = "profile:read" },
#         { S = "profile:update" },
#         { S = "dashboard:access" },
#         { S = "batch:execute" },
#         { S = "batch:read" }
#       ]
#     }
#     description = {
#       S = "Full system administrator permissions - all features accessible"
#     }
#     created_at = {
#       S = timestamp()
#     }
#     updated_at = {
#       S = timestamp()
#     }
#   })
# }

# Batch Operations Table
resource "aws_dynamodb_table" "batch_operations" {
  name           = "${var.project_name}-${var.environment}-batch-operations"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "batch_id"

  attribute {
    name = "batch_id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  # GSI for status + timestamp queries
  global_secondary_index {
    name            = "StatusTimestampIndex"
    hash_key        = "status"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-batch-operations"
  }
}

# Segments Table (運用セグメントのマスタ。Cognitoグループとは独立して管理する)
resource "aws_dynamodb_table" "segments" {
  name           = "${var.project_name}-${var.environment}-segments"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "segment_id"

  attribute {
    name = "segment_id"
    type = "S"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-segments"
  }
}

# User Segments Table (ユーザー<->セグメントの多対多紐付け。隣接リストパターン)
resource "aws_dynamodb_table" "user_segments" {
  name           = "${var.project_name}-${var.environment}-user-segments"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "pk" # SEGMENT#{segment_id}
  range_key      = "sk" # USER#{user_id}

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  # GSI for looking up all segments a given user belongs to (pk/sk swapped)
  global_secondary_index {
    name            = "UserSegmentIndex"
    hash_key        = "sk"
    range_key       = "pk"
    projection_type = "ALL"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-user-segments"
  }
}

# Invites Table (招待制登録用の使い切りコード)
resource "aws_dynamodb_table" "invites" {
  name           = "${var.project_name}-${var.environment}-invites"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "invite_code"

  attribute {
    name = "invite_code"
    type = "S"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-invites"
  }
}