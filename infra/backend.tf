# Terraform Backend Configuration
# S3リモートバックエンドでstateを管理

terraform {
  backend "s3" {
    # これらの値は terraform init 時に指定するか、
    # backend.hcl ファイルで管理します
    
    # bucket = "your-terraform-state-bucket"
    # key    = "futura/terraform.tfstate"
    # region = "us-east-1"
    
    # セキュリティ設定
    encrypt = true
  }
}