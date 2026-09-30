# GongGo infrastructure (Terraform)

```
Internet -> ALB (port 80) -> ECS Fargate (API, port 3000) -> RDS Postgres (private)
                                  |                              ^
                          image from ECR             secrets from SSM Parameter Store
                          logs to CloudWatch
```

| File | What it creates |
|---|---|
| `network.tf` | VPC, 2 public + 2 private subnets, internet gateway, security groups |
| `database.tf` | RDS Postgres 16 (db.t4g.micro) in the private subnets |
| `secrets.tf` | Generated DB password and admin key, stored in SSM Parameter Store |
| `ecr.tf` | Container registry for the API image |
| `alb.tf` | Public load balancer + health checks on `/health` |
| `ecs.tf` | ECS cluster, task definition, service, IAM roles, log group |
| `outputs.tf` | The app URL and other useful values |

## Deploy

```bash
cd infra
terraform init

# 1. Create the registry first, so there's somewhere to push the image
terraform apply -target=aws_ecr_repository.api

# 2. Build and push the image, tagged with the current commit
TAG=$(git rev-parse --short HEAD)
REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build -t "$REPO:$TAG" ..
docker push "$REPO:$TAG"

# 3. Create everything else, running that image
terraform apply -var="image_tag=$TAG"
```

## Check it

```bash
curl "$(terraform output -raw app_url)/health"
aws logs tail "$(terraform output -raw log_group)" --follow
```

## Tear it down (stops all costs)

```bash
terraform destroy
```

Everything is code, so `terraform apply` rebuilds it all in about 10 minutes.
Note that destroying deletes the database and its data.
