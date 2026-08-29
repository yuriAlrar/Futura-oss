variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "Environment must be one of: dev, stg, prod."
  }
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "futura"
}

variable "uploads_bucket_name" {
  description = "S3 bucket name for uploads (optional, defaults to project-environment-uploads). Must be globally unique."
  type        = string
  default     = ""
}