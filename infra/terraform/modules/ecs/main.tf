# ECS Module — ECS Fargate cluster with services for api, web, and worker
# Includes ECR repositories, task definitions, services, and target groups.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Variables ────────────────────────────────────────────────────────────
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "lumenflow"
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB target groups"
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group for ECS tasks"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group for ALB"
  type        = string
}

variable "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  type        = string
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "lumenflow"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "lumenflow"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  type        = string
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "webhook_signing_secret" {
  description = "Webhook HMAC signing secret"
  type        = string
  sensitive   = true
}

variable "api_image_tag" {
  description = "Docker image tag for the API"
  type        = string
  default     = "latest"
}

variable "web_image_tag" {
  description = "Docker image tag for the web app"
  type        = string
  default     = "latest"
}

variable "worker_image_tag" {
  description = "Docker image tag for the worker"
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "web_cpu" {
  type    = number
  default = 256
}

variable "web_memory" {
  type    = number
  default = 512
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memory" {
  type    = number
  default = 512
}

variable "cors_allowed_origins" {
  description = "Comma-separated allowed CORS origins"
  type        = string
  default     = "https://lumenflow.app"
}

variable "stellar_network_passphrase" {
  description = "Stellar network passphrase"
  type        = string
  default     = "Public Global Stellar Network ; September 2015"
}

variable "stellar_horizon_url" {
  description = "Stellar Horizon URL"
  type        = string
  default     = "https://horizon.stellar.org"
}

variable "stellar_rpc_url" {
  description = "Stellar Soroban RPC URL"
  type        = string
  default     = "https://soroban.stellar.org"
}

variable "ecs_log_retention_days" {
  type    = number
  default = 30
}

locals {
  ecr_repo_names = {
    api    = "${var.project_name}/api"
    web    = "${var.project_name}/web"
    worker = "${var.project_name}/worker"
  }

  db_connection_string = "postgresql://${var.db_username}:${var.db_password}@${var.db_endpoint}:5432/${var.db_name}?schema=public"
}

# ── ECR Repositories ────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name                 = local.ecr_repo_names.api
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecr_repository" "web" {
  name                 = local.ecr_repo_names.web
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = local.ecr_repo_names.worker
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.environment
  }
}

# ── ECS Cluster ─────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Environment = var.environment
  }
}

# ── CloudWatch Log Groups ───────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "services" {
  for_each = toset(["api", "web", "worker"])

  name              = "/ecs/${var.project_name}/${var.environment}/${each.value}"
  retention_in_days = var.ecs_log_retention_days

  tags = {
    Environment = var.environment
    Service     = each.value
  }
}

# ── IAM Roles ────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project_name}-${var.environment}-task-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume_role.json

  tags = {
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ── Target Groups ────────────────────────────────────────────────────────
resource "aws_lb_target_group" "api" {
  name        = "${var.project_name}-${var.environment}-api-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-${var.environment}-web-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }

  tags = {
    Environment = var.environment
  }
}

# ── Task Definitions ────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-${var.environment}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"

      portMappings = [
        { containerPort = 4000, hostPort = 4000, protocol = "tcp" }
      ]

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "PORT", value = "4000" },
        { name = "DATABASE_URL", value = local.db_connection_string },
        { name = "REDIS_URL", value = "redis://${var.redis_endpoint}:6379" },
        { name = "STELLAR_NETWORK_PASSPHRASE", value = var.stellar_network_passphrase },
        { name = "STELLAR_HORIZON_URL", value = var.stellar_horizon_url },
        { name = "STELLAR_RPC_URL", value = var.stellar_rpc_url },
        { name = "CORS_ALLOWED_ORIGINS", value = var.cors_allowed_origins },
      ]

      secrets = [
        { name = "JWT_SECRET", valueFrom = "arn:aws:ssm:${data.aws_region.current.name}:<account>:parameter/${var.project_name}/${var.environment}/jwt-secret" },
        { name = "WEBHOOK_SIGNING_SECRET", valueFrom = "arn:aws:ssm:${data.aws_region.current.name}:<account>:parameter/${var.project_name}/${var.environment}/webhook-secret" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["api"].name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
    Service     = "api"
  }
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project_name}-${var.environment}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name  = "web"
      image = "${aws_ecr_repository.web.repository_url}:${var.web_image_tag}"

      portMappings = [
        { containerPort = 3000, hostPort = 3000, protocol = "tcp" }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "NEXT_PUBLIC_API_URL", value = var.environment == "production" ? "https://api.lumenflow.app" : "https://staging-api.lumenflow.app" },
        { name = "NEXT_PUBLIC_STELLAR_NETWORK", value = var.environment == "production" ? "PUBLIC" : "TESTNET" },
        { name = "NEXT_PUBLIC_HORIZON_URL", value = var.stellar_horizon_url },
        { name = "NEXT_PUBLIC_RPC_URL", value = var.stellar_rpc_url },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["web"].name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
    Service     = "web"
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-${var.environment}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name  = "worker"
      image = "${aws_ecr_repository.worker.repository_url}:${var.worker_image_tag}"

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "DATABASE_URL", value = local.db_connection_string },
        { name = "REDIS_URL", value = "redis://${var.redis_endpoint}:6379" },
        { name = "STELLAR_NETWORK_PASSPHRASE", value = var.stellar_network_passphrase },
        { name = "STELLAR_HORIZON_URL", value = var.stellar_horizon_url },
        { name = "STELLAR_RPC_URL", value = var.stellar_rpc_url },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.services["worker"].name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = {
    Environment = var.environment
    Service     = "worker"
  }
}

# ── ECS Services ────────────────────────────────────────────────────────
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.environment == "production" ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port    = 4000
  }

  depends_on = [aws_lb_target_group.api]

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-${var.environment}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.environment == "production" ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port    = 3000
  }

  depends_on = [aws_lb_target_group.web]

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project_name}-${var.environment}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  tags = {
    Environment = var.environment
  }
}

# ── CloudWatch Alarms ───────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "api_high_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-api-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "API CPU utilization above 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "api_high_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-api-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "API memory utilization above 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }

  tags = {
    Environment = var.environment
  }
}

# ── Data Sources ────────────────────────────────────────────────────────
data "aws_region" "current" {}

# ── Outputs ─────────────────────────────────────────────────────────────
output "ecr_repository_urls" {
  value = {
    api    = aws_ecr_repository.api.repository_url
    web    = aws_ecr_repository.web.repository_url
    worker = aws_ecr_repository.worker.repository_url
  }
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "api_target_group_arn" {
  value = aws_lb_target_group.api.arn
}

output "web_target_group_arn" {
  value = aws_lb_target_group.web.arn
}
