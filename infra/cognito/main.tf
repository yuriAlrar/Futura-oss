# Cognito ユーザープール
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  # パスワードポリシー
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = false
  }

  # 自動検証属性（メールアドレス）
  auto_verified_attributes = ["email"]

  # アカウント復旧設定
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # ユーザープールアドオン
  user_pool_add_ons {
    advanced_security_mode = "OFF" # モックアプリのため無効
  }

  # デバイス設定
  device_configuration {
    challenge_required_on_new_device      = false
    device_only_remembered_on_user_prompt = false
  }

  # メール設定
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # ユーザー名設定
  username_configuration {
    case_sensitive = false
  }

  # スキーマ定義：メールアドレス
  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # スキーマ定義：名前
  schema {
    attribute_data_type = "String"
    name               = "name"
    required           = true
    mutable            = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-user-pool"
  }
}

# Cognito ユーザープールクライアント
resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-${var.environment}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # トークン有効期限
  access_token_validity  = 24 # 24時間
  id_token_validity     = 24 # 24時間
  refresh_token_validity = 30 # 30日

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # 認証フロー
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Hosted UI（OAuth authorization codeフロー）は使用しない。
  # 認証は server/api/auth/login.post.ts の InitiateAuth (USER_PASSWORD_AUTH) で
  # 完結しており、Nuxtサーバーが直接Cognito APIを叩く。未使用の認証経路を
  # 公開しないため、OAuth関連の設定とユーザープールドメインは意図的に持たない。

  # ユーザー存在エラーの防止
  prevent_user_existence_errors = "ENABLED"

  # 読み取り・書き込み属性
  read_attributes  = ["email", "name", "email_verified"]
  write_attributes = ["email", "name"]
}

# Cognito グループ
resource "aws_cognito_user_group" "administrator" {
  name         = "administrator"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "システム管理者グループ - すべての機能にアクセス可能"
  precedence   = 0
}

resource "aws_cognito_user_group" "user" {
  name         = "user"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "一般ユーザーグループ - 基本機能にアクセス可能"
  precedence   = 10
}

# 初期管理者ユーザー
resource "aws_cognito_user" "admin" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = "admin@example.com" # メールアドレスをユーザー名として使用

  attributes = {
    email          = "admin@example.com"
    name           = "System Administrator"
    email_verified = "true"
  }

  temporary_password = "TempAdmin123!"
  message_action     = "SUPPRESS" # メール送信を抑制

  lifecycle {
    ignore_changes = [
      temporary_password,
      password
    ]
  }
}



# 管理者ユーザーのグループメンバーシップ
resource "aws_cognito_user_in_group" "admin_membership" {
  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.administrator.name
  username     = aws_cognito_user.admin.username
}