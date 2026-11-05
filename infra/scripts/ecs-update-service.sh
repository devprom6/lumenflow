#!/usr/bin/env bash
# ecs-update-service.sh — Update an ECS Fargate service with a new container image
#
# Usage:
#   ./ecs-update-service.sh <cluster-name> <service-name> <new-image-uri>
#
# Requirements: AWS CLI v2, jq
# The caller must have IAM permissions: ecs:DescribeTaskDefinition,
#   ecs:RegisterTaskDefinition, ecs:UpdateService, ecs:DescribeServices

set -euo pipefail

CLUSTER="${1:?Usage: $0 <cluster> <service> <image-uri>}"
SERVICE="${2:?Usage: $0 <cluster> <service> <image-uri>}"
NEW_IMAGE="${3:?Usage: $0 <cluster> <service> <image-uri>}"

echo "==> Updating ECS service: cluster=${CLUSTER} service=${SERVICE}"
echo "    New image: ${NEW_IMAGE}"

# ── 1. Get current task definition ARN from service ──────────────────────────
CURRENT_TASK_DEF_ARN=$(
  aws ecs describe-services \
    --cluster "${CLUSTER}" \
    --services "${SERVICE}" \
    --query 'services[0].taskDefinition' \
    --output text
)

echo "==> Current task definition: ${CURRENT_TASK_DEF_ARN}"

# ── 2. Describe the task definition JSON ─────────────────────────────────────
TASK_DEF_JSON=$(
  aws ecs describe-task-definition \
    --task-definition "${CURRENT_TASK_DEF_ARN}" \
    --query 'taskDefinition'
)

# ── 3. Determine container name (first container in definition) ───────────────
CONTAINER_NAME=$(echo "${TASK_DEF_JSON}" | jq -r '.containerDefinitions[0].name')
echo "==> Updating container '${CONTAINER_NAME}' with new image"

# ── 4. Build new task definition with updated image ───────────────────────────
NEW_TASK_DEF=$(
  echo "${TASK_DEF_JSON}" \
  | jq --arg IMAGE "${NEW_IMAGE}" \
       --arg CONTAINER "${CONTAINER_NAME}" \
    '.containerDefinitions |= map(
       if .name == $CONTAINER then .image = $IMAGE else . end
     )
     | del(.taskDefinitionArn, .revision, .status,
           .requiresAttributes, .compatibilities,
           .registeredAt, .registeredBy)'
)

# ── 5. Register new task definition revision ──────────────────────────────────
NEW_TASK_DEF_ARN=$(
  aws ecs register-task-definition \
    --cli-input-json "${NEW_TASK_DEF}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text
)

echo "==> New task definition registered: ${NEW_TASK_DEF_ARN}"

# ── 6. Update the service to use the new revision ─────────────────────────────
aws ecs update-service \
  --cluster "${CLUSTER}" \
  --service "${SERVICE}" \
  --task-definition "${NEW_TASK_DEF_ARN}" \
  --force-new-deployment \
  --output json \
  | jq -r '.service | "\(.serviceName) updated to \(.taskDefinition)"'

# ── 7. Wait for stable deployment ─────────────────────────────────────────────
echo "==> Waiting for service stability (timeout 10 min)..."
aws ecs wait services-stable \
  --cluster "${CLUSTER}" \
  --services "${SERVICE}"

echo "==> Deployment complete: ${SERVICE} is stable."
