# ---------------------------------------------------------------------------
# ECS Fargate: runs our container without us managing any servers.
#   cluster         -> a logical group for our services
#   task definition -> "how to run the container" (image, CPU, memory, env)
#   service         -> "keep N copies running, behind the load balancer"
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = var.project
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-api"
  retention_in_days = 7
}

# --- IAM ---------------------------------------------------------------------
# The *execution role* is used by ECS itself to start the container: pull the
# image, write logs, and read our two secrets. Nothing more.

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.project}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = [aws_ssm_parameter.database_url.arn, aws_ssm_parameter.admin_key.arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "read-gonggo-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# The *task role* is what the app itself could use to call AWS. It needs
# nothing yet, so it gets no permissions (least privilege).
resource "aws_iam_role" "task" {
  name               = "${var.project}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# --- Task definition -----------------------------------------------------------

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256 # 0.25 vCPU
  memory                   = 512 # MB
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${data.aws_ecr_repository.api.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = 3000, protocol = "tcp" }]

    environment = [
      { name = "PORT", value = "3000" },
      { name = "SEED", value = tostring(var.seed_sample_games) },
    ]

    # Pulled from Parameter Store at start-up; never visible in the console
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "ADMIN_KEY", valueFrom = aws_ssm_parameter.admin_key.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

# --- Service -------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true # needed to reach ECR and CloudWatch without a NAT gateway
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  # Give the app time to run migrations before health checks count
  health_check_grace_period_seconds = 60

  # If a new version keeps failing health checks, roll back automatically
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.http]
}
