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
  description = "Add 3 sample Wollongong games to an empty database. Off on AWS: real users would try to join games that don't exist."
  type        = bool
  default     = false
}

# ---- Sign-in

variable "app_urls" {
  description = "HTTPS addresses of the app (with a trailing slash) that Cognito may return people to, e.g. [\"https://gonggo.app/\"]"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for u in var.app_urls : startswith(u, "https://")])
    error_message = "Cognito only accepts https:// addresses here (http://localhost is added automatically)."
  }
}

variable "google_client_id" {
  description = "Google OAuth client ID. Leave empty to turn off Google sign-in."
  type        = string
  default     = ""
}

variable "apple_services_id" {
  description = "Apple Services ID for Sign in with Apple. Leave empty to turn off Apple sign-in."
  type        = string
  default     = ""
}

variable "apple_team_id" {
  type    = string
  default = ""
}

variable "apple_key_id" {
  type    = string
  default = ""
}
