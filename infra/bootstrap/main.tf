# ---------------------------------------------------------------------------
# Bootstrap: the things that must exist BEFORE the main infrastructure.
#
#   1. An S3 bucket to hold the main stack's Terraform state
#   2. GitHub's OIDC identity provider, so GitHub Actions can log in to AWS
#   3. A deploy role that GitHub Actions (main branch only) is allowed to use
#   4. The ECR image registry (long-lived, so destroying the app keeps images)
#
# Run once, by hand, from your laptop. Its own state stays local, because it
# can't store its state in a bucket it hasn't created yet (chicken and egg).
# It's also kept separate on purpose: the pipeline must not be able to change
# its own permissions.
# ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "gonggo"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "gonggo-tfstate-${local.account_id}" # bucket names are global, so include the account ID
}

# --- 1. State bucket ---------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
}

# Keep every previous version of the state, so a bad apply can be undone
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# State contains secrets: encrypt it at rest
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# And never, ever make it public
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are only needed for a while
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# --- 2. GitHub OIDC provider -------------------------------------------------
# Tells AWS to trust login tokens signed by GitHub Actions.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# --- 3. Deploy role ----------------------------------------------------------

# WHO can use the role: only GitHub Actions runs from the main branch of this
# one repo. A fork, another repo, or a pull request branch gets refused.
data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # GitHub includes immutable owner and repo IDs, so a deleted or renamed
      # repo's name can't be reused by someone else to get into this role
      values = ["repo:DipankerBaral@39428181/gonggo-api@1397703369:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "gonggo-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_trust.json
  max_session_duration = 3600 # credentials expire after an hour at most
}

# WHAT the role can do: manage the AWS services GongGo uses, and nothing else.
# Much narrower than admin (no billing, no users, no other IAM roles), though
# not fully least-privilege yet. Tightening it is a good future exercise.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid = "ManageGongGoServices"
    actions = [
      "ec2:*",
      "ecs:*",
      "ecr:*",
      "elasticloadbalancing:*",
      "rds:*",
      "logs:*",
      "application-autoscaling:*",
      "cognito-idp:*",
      "cloudfront:*",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ManageGongGoParameters"
    actions   = ["ssm:*"]
    resources = ["arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/gonggo/*"]
  }

  statement {
    sid       = "DescribeParameters"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # IAM only for roles whose names start with gonggo-, except this deploy
  # role itself (so the pipeline can't give itself more power)
  statement {
    sid       = "ManageGongGoRoles"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::${local.account_id}:role/gonggo-*"]
  }

  statement {
    sid       = "NeverTouchOwnRole"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [aws_iam_role.deploy.arn]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/*"]
  }

  # Terraform state: read/write the state file and its lock file
  statement {
    sid       = "StateBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/infra/*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "gonggo-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# --- 4. ECR image registry ---------------------------------------------------
# Lives here rather than in the main stack so "terraform destroy" on the app
# doesn't delete your images, and the pipeline always has somewhere to push.

resource "aws_ecr_repository" "api" {
  name                 = "gonggo-api"
  image_tag_mutability = "IMMUTABLE" # a tag can't be overwritten: sha tags always mean one exact build
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true # free basic scan for known vulnerabilities
  }
}

# Keep only the 10 newest images so storage costs stay tiny
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# --- Outputs -----------------------------------------------------------------

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "deploy_role_arn" {
  description = "Put this in GitHub: Settings > Secrets and variables > Actions > Variables > AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}
