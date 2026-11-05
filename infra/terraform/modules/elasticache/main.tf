# ElastiCache Module — Managed Redis for queues, caching, and rate limiting

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
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for the cache subnet group"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for Redis"
  type        = string
}

variable "node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "num_cache_nodes" {
  description = "Number of cache nodes (1 for non-clustered)"
  type        = number
  default     = 1
}

# ── Cache Subnet Group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-cache-subnet"
  subnet_ids   = var.subnet_ids
  description = "Cache subnet group for ${var.project_name} ${var.environment}"

  tags = {
    Environment = var.environment
  }
}

# ── Redis Replication Group ─────────────────────────────────────────────
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}-redis"
  description          = "Redis for ${var.project_name} ${var.environment}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"

  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.security_group_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false  # Set true in production with TLS clients

  automatic_failover_enabled = var.num_cache_nodes > 1
  multi_az_enabled           = var.num_cache_nodes > 1

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-05:00"
  maintenance_window       = "sun:05:00-sun:06:00"

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis"
    Environment = var.environment
    Project     = var.project_name
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}
