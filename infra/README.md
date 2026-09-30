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
| `ecr.tf` | Looks up the ECR registry (created by `bootstrap/`) |
| `alb.tf` | Public load balancer + health checks on `/health` |
| `ecs.tf` | ECS cluster, task definition, service, IAM roles, log group |
| `outputs.tf` | The app URL and other useful values |

## Deploy

Deploys are automatic. Every push to `main` that passes CI is deployed by the
**Deploy to AWS** job in `.github/workflows/ci.yml`:

1. Log in to AWS with GitHub OIDC (no stored keys)
2. Copy the tested image from GHCR into ECR, tagged with the commit sha
3. `terraform plan`, then `terraform apply` of exactly that plan
4. Wait for ECS to roll out, and fail if it rolled back instead
5. Smoke test `/health` and `/games`

Control it with the repo variable `DEPLOY_ENABLED` (`true` / `false`), and tear
everything down with the **Destroy AWS infrastructure** workflow.

One-time setup (already done): `infra/bootstrap` creates the state bucket, the
ECR repository, GitHub's OIDC provider and the deploy role. Run it by hand with
admin credentials; its state stays local.

To run Terraform from your laptop instead, it uses the same S3 state:

```bash
cd infra
terraform init
terraform plan -var="image_tag=<7-char commit sha already in ECR>"
```

## Check it

```bash
curl "$(terraform output -raw app_url)/health"
aws logs tail "$(terraform output -raw log_group)" --follow
```

## Tear it down (stops all costs)

Run **Actions → Destroy AWS infrastructure**, type `destroy`, then set
`DEPLOY_ENABLED` to `false`. Images and state are kept; the database is not.
