# ---------------------------------------------------------------------------
# Secrets live in SSM Parameter Store (encrypted, free tier), never in code.
# ECS reads them when a container starts and passes them in as env variables.
# ---------------------------------------------------------------------------

resource "random_password" "admin_key" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/${var.project}/database-url"
  type  = "SecureString"
  value = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?sslmode=no-verify"

  # sslmode=no-verify: traffic to the database is encrypted, but the client
  # skips checking the certificate authority. Good enough inside our private
  # network for now; a production setup would bundle the RDS CA certificate.
}

resource "aws_ssm_parameter" "admin_key" {
  name  = "/${var.project}/admin-key"
  type  = "SecureString"
  value = random_password.admin_key.result
}
