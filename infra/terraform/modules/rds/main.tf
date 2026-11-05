# RDS Module — Managed PostgreSQL Aurora cluster for LumenFlow

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "lumenflow"
}

variable "vpc_id" {
  description = "VPC ID where RDS will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the DB subnet group"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for RDS"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "lumenflow"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "lumenflow"
}

variable "db_password" {
  description = "Database master password (from Secrets Manager or SSM)"
  type        = string
  sensitive   = true
}

variable "multi_az" {
  description = "Enable Multi-AZ for production"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Automated backup retention period"
  type        = number
  default     = 7
}

# ── DB Subnet Group ─────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "DB subnet group for ${var.project_name} ${var.environment}"

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-subnet-group"
    Environment = var.environment
  }
}

# ── Parameter Group ─────────────────────────────────────────────────────
resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-pg"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Environment = var.environment
  }
}

# ── RDS Instance ────────────────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-postgres"

  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = var.db_instance_class
  allocated_storage    = var.allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [var.security_group_id]

  multi_az               = var.multi_az
  backup_retention_period = var.backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:30-sun:05:30"

  deletion_protection      = var.environment == "production"
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final-snapshot" : null

  copy_tags_to_snapshot = true
  publicly_accessible    = false

  tags = {
    Name        = "${var.project_name}-${var.environment}-postgres"
    Environment = var.environment
    Project     = var.project_name
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "db_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.main.arn
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}
