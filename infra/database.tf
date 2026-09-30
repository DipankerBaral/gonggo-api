# ---------------------------------------------------------------------------
# RDS Postgres: AWS runs the database for us (patching, backups, storage).
# Lives in the private subnets and only accepts connections from the API.
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  length  = 32
  special = false # keeps the password safe to put inside a connection URL
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro" # smallest, cheapest size

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "gonggo"
  username = "gonggo"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false

  backup_retention_period = 1
  multi_az                = false # one copy; production would use true

  # Learning-project settings so "terraform destroy" works cleanly.
  # In production you'd keep a final snapshot and turn on deletion protection.
  skip_final_snapshot = true
  deletion_protection = false
  apply_immediately   = true
}
