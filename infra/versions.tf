terraform {
  required_version = ">= 1.6"

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

  # State is stored locally for now (terraform.tfstate, git-ignored because it
  # contains secrets). Later we'll move it to S3 so CI can use it too.
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
