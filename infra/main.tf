terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "futura"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Cognito
module "cognito" {
  source = "./cognito"

  environment  = var.environment
  project_name = var.project_name
}

# DynamoDB
module "dynamodb" {
  source = "./dynamodb"
  
  environment = var.environment
  project_name = var.project_name
}

# S3
module "s3" {
  source = "./s3"

  environment         = var.environment
  project_name        = var.project_name
  uploads_bucket_name = var.uploads_bucket_name
}

# IAM
module "iam" {
  source = "./iam"
  
  environment = var.environment
  project_name = var.project_name
  cognito_user_pool_arn = module.cognito.user_pool_arn
  s3_bucket_arn = module.s3.bucket_arn
  dynamodb_table_arns = module.dynamodb.table_arns
}

# Lambda
module "lambda" {
  source = "./lambda"
  
  environment = var.environment
  project_name = var.project_name
  lambda_execution_role_arn = module.iam.lambda_execution_role_arn
}