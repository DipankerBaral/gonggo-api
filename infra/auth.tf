# ---------------------------------------------------------------------------
# Sign-in with Amazon Cognito.
#
#   user pool -> the accounts (email + password, verified by email)
#   domain    -> Cognito's sign-in pages: https://gonggo-<account>.auth.<region>.amazoncognito.com
#   client    -> the GongGo web app, allowed to use those pages (PKCE, no secret)
#   providers -> Google and Apple, each switched on only when configured
#
# Cognito only accepts HTTPS sign-in return addresses, except http://localhost.
# Until GongGo has a domain with HTTPS, sign-in works locally but not on the
# AWS load balancer's http:// address. Add the https:// address to app_urls.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

locals {
  google_enabled = var.google_client_id != ""
  apple_enabled  = var.apple_services_id != ""

  # Where Cognito may send people back to after signing in or out
  return_urls = concat(["http://localhost:3000/"], var.app_urls)

  identity_providers = concat(
    ["COGNITO"],
    local.google_enabled ? ["Google"] : [],
    local.apple_enabled ? ["SignInWithApple"] : [],
  )

  cognito_domain = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

resource "aws_cognito_user_pool" "main" {
  name = var.project

  username_attributes      = ["email"] # people sign in with their email address
  auto_verified_attributes = ["email"] # Cognito emails a code to prove it's theirs

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Cognito's built-in email sender: fine for a beta (it has a low daily
  # limit). For launch, switch to Amazon SES with your own domain.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  deletion_protection = "INACTIVE" # set to ACTIVE once real people have accounts
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# --- Google (free) ----------------------------------------------------------
# Needs an OAuth client from Google Cloud Console. The client ID goes in
# var.google_client_id; the secret goes in Parameter Store (never in code):
#   aws ssm put-parameter --name /gonggo/google-client-secret --type SecureString --value '...'

data "aws_ssm_parameter" "google_client_secret" {
  count = local.google_enabled ? 1 : 0
  name  = "/${var.project}/google-client-secret"
}

resource "aws_cognito_identity_provider" "google" {
  count         = local.google_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = data.aws_ssm_parameter.google_client_secret[0].value
    authorize_scopes = "openid email profile"
    # Cognito fills these in itself; listing them stops a change showing on every plan
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    email      = "email"
    given_name = "given_name"
    username   = "sub"
  }
}

# --- Apple (needs a paid Apple Developer membership) ------------------------
# Set var.apple_services_id, apple_team_id and apple_key_id, and put the .p8
# private key in Parameter Store as /gonggo/apple-private-key.

data "aws_ssm_parameter" "apple_private_key" {
  count = local.apple_enabled ? 1 : 0
  name  = "/${var.project}/apple-private-key"
}

resource "aws_cognito_identity_provider" "apple" {
  count         = local.apple_enabled ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    client_id        = var.apple_services_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = data.aws_ssm_parameter.apple_private_key[0].value
    authorize_scopes = "email name"
  }

  attribute_mapping = {
    email      = "email"
    given_name = "firstName" # Apple only shares the name the first time someone signs in
    username   = "sub"
  }
}

# --- The web app client -----------------------------------------------------

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false # a browser can't keep a secret; PKCE protects the flow instead
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = local.identity_providers
  callback_urls                        = local.return_urls
  logout_urls                          = local.return_urls

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED" # don't reveal whether an email has an account

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  read_attributes  = ["email", "email_verified", "given_name"]
  write_attributes = ["email", "given_name"] # lets Google and Apple fill these in

  depends_on = [aws_cognito_identity_provider.google, aws_cognito_identity_provider.apple]
}

# --- Admins -----------------------------------------------------------------
# People in this group see the admin page. Add yourself after signing up:
#   terraform output -raw make_admin_command   (then put in your email)

resource "aws_cognito_user_group" "admins" {
  name         = "admins"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "GongGo moderators: can review reports, remove content and ban people"
}
