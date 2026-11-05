# ALB Module — Application Load Balancer for routing to ECS services

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
  description = "Project name"
  type        = string
  default     = "lumenflow"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for ALB"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for the ALB"
  type        = string
}

variable "ssl_certificate_arn" {
  description = "ARN of the SSL certificate for HTTPS listener"
  type        = string
  default     = ""
}

variable "api_target_group_arn" {
  description = "Target group ARN for the API service"
  type        = string
}

variable "web_target_group_arn" {
  description = "Target group ARN for the web service"
  type        = string
}

# ── Application Load Balancer ───────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production"
  enable_http2               = true

  tags = {
    Name        = "${var.project_name}-${var.environment}-alb"
    Environment = var.environment
  }
}

# ── HTTP Listener (redirect to HTTPS in production) ─────────────────────
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ── HTTPS Listener ──────────────────────────────────────────────────────
resource "aws_lb_listener" "https" {
  count = var.ssl_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy         = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn    = var.ssl_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = var.web_target_group_arn
  }
}

# ── API Path Listener Rule (HTTPS) ─────────────────────────────────────
resource "aws_lb_listener_rule" "api" {
  count = var.ssl_certificate_arn != "" ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = var.api_target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/docs", "/health", "/metrics", "/webhooks/*"]
    }
  }
}

# ── HTTP Listener (fallback for staging without SSL) ───────────────────
resource "aws_lb_listener" "http_fallback" {
  count = var.ssl_certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = var.web_target_group_arn
  }
}

resource "aws_lb_listener_rule" "api_http" {
  count = var.ssl_certificate_arn == "" ? 1 : 0

  listener_arn = aws_lb_listener.http_fallback[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = var.api_target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/docs", "/health", "/metrics", "/webhooks/*"]
    }
  }
}

# ── Outputs ─────────────────────────────────────────────────────────────
output "alb_dns_name" {
  description = "DNS name of the ALB"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the ALB"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "Zone ID of the ALB"
  value       = aws_lb.main.zone_id
}
