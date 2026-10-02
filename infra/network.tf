# ---------------------------------------------------------------------------
# Networking: a private network (VPC) for GongGo with two kinds of subnet.
#
#   public subnets  -> load balancer and API containers (can reach the internet)
#   private subnets -> database only (no route to or from the internet)
#
# Two of each, in two availability zones (separate data centres), because the
# load balancer and RDS both require it.
#
# Cost note: we deliberately skip a NAT gateway (~US$40+/month). The containers
# sit in public subnets with public IPs so they can pull images and send logs,
# but the security groups below only let the load balancer talk to them.
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index) # 10.0.0.0/24, 10.0.1.0/24
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10) # 10.0.10.0/24, 10.0.11.0/24
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.project}-private-${local.azs[count.index]}" }
}

# Public subnets send internet traffic through the internet gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project}-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets get no internet route at all (they use the VPC's default
# route table, which only routes inside the VPC).

# ---------------------------------------------------------------------------
# Security groups: firewalls that chain together.
#   internet -> ALB (port 80) -> API (port 3000) -> database (port 5432)
# Each layer only accepts traffic from the layer in front of it.
# ---------------------------------------------------------------------------

# AWS's own, always up-to-date list of the addresses CloudFront uses to reach origins
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "alb" {
  name = "${var.project}-alb"
  # Kept as it was: AWS can't edit a security group's description, so changing
  # it would make Terraform replace the group (and it's in use by the ALB)
  description = "Public HTTP to the load balancer"
  vpc_id      = aws_vpc.main.id

  # Only CloudFront can reach the load balancer, so everyone comes in through
  # HTTPS on CloudFront: there's one front door, not two
  ingress {
    description     = "HTTP from CloudFront"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api" {
  name        = "${var.project}-api"
  description = "API containers: only the load balancer may connect"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port from the load balancer only"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Outbound: pull images, send logs, reach the database"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "Postgres: only the API containers may connect"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the API only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}
