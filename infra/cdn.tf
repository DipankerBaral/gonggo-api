# ---------------------------------------------------------------------------
# CloudFront in front of the load balancer: HTTPS for GongGo without needing
# a domain yet. The address looks like https://d1abc2def3.cloudfront.net and
# has a valid certificate, so browsers trust it and Cognito accepts it for
# sign-in. When GongGo gets a domain, it points at this same distribution.
#
#   browser --HTTPS--> CloudFront --HTTP--> load balancer --> ECS --> RDS
#
# Cost: CloudFront's always-free tier (1 TB out and 10 million requests a
# month) is far more than GongGo needs.
# ---------------------------------------------------------------------------

# Nothing personal is ever cached: pages and API calls always reach the app.
# Authorization is part of the "key" so even a stray cache can't mix users up,
# and the 1-second maximum means nothing lingers.
resource "aws_cloudfront_cache_policy" "app" {
  name        = "${var.project}-no-cache"
  comment     = "GongGo pages and API: not cached, sign-in header passed through"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 1

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization"] # CloudFront only passes this to the app on GET if it's listed here
      }
    }
    query_strings_config {
      query_string_behavior = "all"
    }
    cookies_config {
      cookie_behavior = "none"
    }
  }
}

# AWS-managed policies, looked up by name
data "aws_cloudfront_cache_policy" "optimised" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader" # pass everything on, except Host (the ALB doesn't need it)
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  comment         = "GongGo"
  is_ipv6_enabled = true
  price_class     = "PriceClass_All" # includes the Sydney edge locations
  http_version    = "http2and3"

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only" # the ALB gets HTTPS too once there's a domain for its certificate
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_keepalive_timeout = 60
    }
  }

  # Everything by default: pages, the app's own files and the API. Not cached.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.app.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # Fonts and the map library never change, so they're cached at the edge
  ordered_cache_behavior {
    path_pattern           = "/vendor/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimised.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # the *.cloudfront.net certificate, until there's a domain
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

locals {
  public_url = "https://${aws_cloudfront_distribution.main.domain_name}"
}
