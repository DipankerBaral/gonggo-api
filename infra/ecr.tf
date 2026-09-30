# ---------------------------------------------------------------------------
# ECR: Amazon's container registry. ECS pulls our image from here.
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "api" {
  name                 = "${var.project}-api"
  image_tag_mutability = "IMMUTABLE" # a tag can't be overwritten: sha tags always mean one exact build
  force_delete         = true        # let "terraform destroy" remove it even with images inside

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
