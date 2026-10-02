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

  # Grows by itself (20 GB up to 50 GB) rather than the app breaking when full
  max_allocated_storage = 50

  # Daily backups kept for a week, which also allows point-in-time recovery:
  # restoring the database to any minute in the last 7 days (see README).
  backup_retention_period = 7
  backup_window           = "16:00-16:30"         # 2:00am Sydney (AEST), when nobody's playing
  maintenance_window      = "sun:17:00-sun:17:30" # 3:00am Sunday Sydney: minor updates
  copy_tags_to_snapshot   = true

  multi_az = false # one copy keeps costs down; true would survive a data-centre failure, at double the price

  # With protect_data on (the default), nothing can delete the database, and
  # deleting it on purpose leaves a final snapshot behind.
  deletion_protection       = var.protect_data
  skip_final_snapshot       = !var.protect_data
  final_snapshot_identifier = var.protect_data ? "${var.project}-db-final" : null
  apply_immediately         = true
}
