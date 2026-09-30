output "app_url" {
  description = "Public URL of the API"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "Where to push Docker images"
  value       = aws_ecr_repository.api.repository_url
}

output "log_group" {
  description = "CloudWatch log group for the API"
  value       = aws_cloudwatch_log_group.api.name
}

output "admin_key_command" {
  description = "Run this to see the admin key"
  value       = "aws ssm get-parameter --name ${aws_ssm_parameter.admin_key.name} --with-decryption --query Parameter.Value --output text"
}
