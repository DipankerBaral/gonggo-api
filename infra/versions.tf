terraform {
  required_version = ">= 1.10" # needed for S3 use_lockfile

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in S3 (created by infra/bootstrap), so your laptop and GitHub
  # Actions share one copy. use_lockfile stops two applies running at once.
  # Backend settings can't use variables, so the bucket name is written out.
  backend "s3" {
    bucket       = "gonggo-tfstate-477554785759"
    key          = "infra/terraform.tfstate"
    region       = "ap-southeast-2"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  # Every resource gets these tags, so you can find (and cost) everything
  # GongGo creates in the AWS console.
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
