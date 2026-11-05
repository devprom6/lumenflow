# Production Environment — Stellar Mainnet, Multi-AZ, hardened resources

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "lumenflow-tfstate"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "lumenflow-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Variables ────────────────────────────────────────────────────────────
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "webhook_signing_secret" {
  type      = string
  sensitive = true
}

variable "ssl_certificate_arn" {
  description = "ARN of the ACM SSL certificate for production HTTPS"
  type        = string
}

# ── VPC ─────────────────────────────────────────────────────────────────
module "vpc" {
  source             = "../../modules/vpc"
  environment        = "production"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# ── RDS ────────────────────────────────────────────────────────────────
module "rds" {
  source              = "../../modules/rds"
  environment         = "production"
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnet_ids
  security_group_id   = module.vpc.rds_security_group_id
  db_instance_class   = "db.r6g.large"
  allocated_storage   = 100
  multi_az            = true
  backup_retention_days = 30
  db_password         = var.db_password
}

# ── ElastiCache ──────────────────────────────────────────────────────────
module "elasticache" {
  source            = "../../modules/elasticache"
  environment       = "production"
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.vpc.redis_security_group_id
  node_type         = "cache.r6g.large"
  num_cache_nodes   = 2
}

# ── ECS ─────────────────────────────────────────────────────────────────
module "ecs" {
  source                      = "../../modules/ecs"
  environment                 = "production"
  vpc_id                      = module.vpc.vpc_id
  private_subnet_ids          = module.vpc.private_subnet_ids
  public_subnet_ids           = module.vpc.public_subnet_ids
  ecs_security_group_id       = module.vpc.ecs_security_group_id
  alb_security_group_id       = module.vpc.alb_security_group_id
  db_endpoint                 = module.rds.db_endpoint
  db_password                 = var.db_password
  redis_endpoint              = module.elasticache.redis_endpoint
  jwt_secret                  = var.jwt_secret
  webhook_signing_secret      = var.webhook_signing_secret
  cors_allowed_origins        = "https://lumenflow.app"
  stellar_network_passphrase  = "Public Global Stellar Network ; September 2015"
  stellar_horizon_url         = "https://horizon.stellar.org"
  stellar_rpc_url             = "https://soroban.stellar.org"
  api_cpu                     = 1024
  api_memory                  = 2048
}

# ── ALB ─────────────────────────────────────────────────────────────────
module "alb" {
  source               = "../../modules/alb"
  environment           = "production"
  vpc_id               = module.vpc.vpc_id
  public_subnet_ids    = module.vpc.public_subnet_ids
  security_group_id    = module.vpc.alb_security_group_id
  ssl_certificate_arn  = var.ssl_certificate_arn
  api_target_group_arn = module.ecs.api_target_group_arn
  web_target_group_arn = module.ecs.web_target_group_arn
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "db_endpoint" {
  value     = module.rds.db_endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = module.elasticache.redis_endpoint
  sensitive = true
}

output "ecr_repository_urls" {
  value = module.ecs.ecr_repository_urls
}
