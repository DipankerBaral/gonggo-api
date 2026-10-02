output "app_url" {
  description = "GongGo's public address (HTTPS, through CloudFront)"
  value       = local.public_url
}

output "load_balancer_url" {
  description = "The load balancer itself. Only CloudFront can reach it, so this won't open in a browser."
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  description = "Where to push Docker images"
  value       = data.aws_ecr_repository.api.repository_url
}

output "log_group" {
  description = "CloudWatch log group for the API"
  value       = aws_cloudwatch_log_group.api.name
}

output "admin_key_command" {
  description = "Run this to see the admin key"
  value       = "aws ssm get-parameter --name ${aws_ssm_parameter.admin_key.name} --with-decryption --query Parameter.Value --output text"
}

output "task_definition_arn" {
  description = "The task definition this apply deployed (the pipeline checks ECS is running it)"
  value       = aws_ecs_task_definition.api.arn
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.api.name
}

output "cognito_domain" {
  description = "Cognito's sign-in pages"
  value       = local.cognito_domain
}

output "cognito_google_redirect_uri" {
  description = "Paste this into Google Cloud Console as an authorised redirect URI"
  value       = "https://${local.cognito_domain}/oauth2/idpresponse"
}

output "local_env" {
  description = "Put these lines in a .env file to use real sign-in with docker compose on your laptop"
  value       = <<-EOT
    COGNITO_USER_POOL_ID=${aws_cognito_user_pool.main.id}
    COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.web.id}
    COGNITO_DOMAIN=${local.cognito_domain}
    AUTH_PROVIDERS=${join(",", concat(local.google_enabled ? ["google"] : [], local.apple_enabled ? ["apple"] : []))}
  EOT
}

output "make_admin_command" {
  description = "Run this (with your sign-up email) to make yourself an admin, then sign out and in again"
  value       = "aws cognito-idp admin-add-user-to-group --user-pool-id ${aws_cognito_user_pool.main.id} --group-name admins --username YOUR_EMAIL"
}
