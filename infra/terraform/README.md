# LumenFlow Terraform Infrastructure

Infrastructure-as-code for deploying LumenFlow to AWS using ECS Fargate.

## Structure

```
infra/terraform/
├── modules/
│   ├── vpc/            # VPC, subnets, NAT, security groups
│   ├── rds/            # Managed PostgreSQL (RDS)
│   ├── elasticache/    # Managed Redis (ElastiCache)
│   ├── ecs/            # ECS Fargate cluster + ECR + services
│   └── alb/            # Application Load Balancer + listeners
├── environments/
│   ├── staging/        # Staging (Testnet, single-AZ)
│   └── production/     # Production (Mainnet, Multi-AZ)
└── README.md
```

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with appropriate credentials
- S3 bucket `lumenflow-tfstate` and DynamoDB table `lumenflow-tf-locks` for state management

## Usage

### Staging
```bash
cd infra/terraform/environments/staging
terraform init
terraform plan -var="db_password=..." -var="jwt_secret=..." -var="webhook_signing_secret=..."
terraform apply -var="db_password=..." -var="jwt_secret=..." -var="webhook_signing_secret=..."
```

### Production
```bash
cd infra/terraform/environments/production
terraform init
terraform plan \
  -var="db_password=..." \
  -var="jwt_secret=..." \
  -var="webhook_signing_secret=..." \
  -var="ssl_certificate_arn=arn:aws:acm:..."
terraform apply \
  -var="db_password=..." \
  -var="jwt_secret=..." \
  -var="webhook_signing_secret=..." \
  -var="ssl_certificate_arn=arn:aws:acm:..."
```

## Security

- All secrets should be passed via `-var` from a secrets manager, not hardcoded
- RDS and Redis are in private subnets with security group access controls
- ECS tasks run in private subnets behind the ALB
- Production has Multi-AZ RDS, Redis failover, and 2+ ECS replicas
- Sensitive outputs are marked as sensitive
