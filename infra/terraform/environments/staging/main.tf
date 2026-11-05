# Staging Environment — Stellar Testnet, single-AZ, minimal resources

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
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "lumenflow-tf-locks"
  }
}

# ── Provider ────────────────────────────────────────────────────────────
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

# ── VPC Module ──────────────────────────────────────────────────────────
module "vpc" {
  source             = "../../modules/vpc"
  environment        = "staging"
  vpc_cidr           = "10.1.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

# ── RDS Module ──────────────────────────────────────────────────────────
module "rds" {
  source             = "../../modules/rds"
  environment        = "staging"
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_id  = module.vpc.rds_security_group_id
  db_instance_class  = "db.t3.small"
  allocated_storage  = 20
  multi_az           = false
  backup_retention_days = 3
  db_password        = var.db_password
}

# ── ElastiCache Module ──────────────────────────────────────────────────
module "elasticache" {
  source            = "../../modules/elasticache"
  environment       = "staging"
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.vpc.redis_security_group_id
  node_type         = "cache.t3.micro"
}

# ── ECS Module ──────────────────────────────────────────────────────────
module "ecs" {
  source                      = "../../modules/ecs"
  environment                 = "staging"
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
  cors_allowed_origins        = "https://staging.lumenflow.app,http://localhost:3000"
  stellar_network_passphrase  = "Test SDF Network ; September 2015"
  stellar_horizon_url         = "https://horizon-testnet.stellar.org"
  stellar_rpc_url             = "https://soroban-testnet.stellar.org"
}

# ── ALB Module ──────────────────────────────────────────────────────────
module "alb" {
  source               = "../../modules/alb"
  environment           = "staging"
  vpc_id               = module.vpc.vpc_id
  public_subnet_ids    = module.vpc.public_subnet_ids
  security_group_id    = module.vpc.alb_security_group_id
  api_target_group_arn = module.ecs.api_target_group_arn
  web_target_group_arn = module.ecs.web_target_group_arn
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "db_endpoint" {
  value = module.rds.db_endpoint
}

output "redis_endpoint" {
  value = module.elasticache.redis_endpoint
}

output "ecr_repository_urls" {
  value = module.ecs.ecr_repository_urls
}
