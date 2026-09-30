# The ECR repository is created by infra/bootstrap (so destroying the app
# keeps your images). Here we just look it up to get its URL.
data "aws_ecr_repository" "api" {
  name = "${var.project}-api"
}
