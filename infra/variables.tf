variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-southeast-2" # Sydney, closest to Wollongong
}

variable "project" {
  description = "Name used for all resources"
  type        = string
  default     = "gonggo"
}

variable "image_tag" {
  description = "Which image tag in ECR to run (we use the short git commit sha)"
  type        = string
  default     = "latest"
}

variable "desired_count" {
  description = "How many copies of the API container to run"
  type        = number
  default     = 1
}

variable "seed_sample_games" {
  description = "Add 3 sample Wollongong games to an empty database"
  type        = bool
  default     = true
}
