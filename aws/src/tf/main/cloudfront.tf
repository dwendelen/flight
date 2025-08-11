resource "aws_cloudfront_distribution" "main" {
  enabled = true

  origin {
    domain_name = aws_s3_bucket.ui.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.ui.bucket
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.ui.cloudfront_access_identity_path
    }
  }

  default_root_object = "index.html"

  aliases = [local.ui-domain-name]

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  price_class = "PriceClass_100"

  viewer_certificate {
    minimum_protocol_version = "TLSv1.2_2021"
    acm_certificate_arn = aws_acm_certificate_validation.ui.certificate_arn
    ssl_support_method = "sni-only"
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = aws_s3_bucket.ui.bucket
    viewer_protocol_policy = "https-only"
    cache_policy_id = var.ui-cache-policy-id
    compress = true
  }
  tags = local.default-tags
}

resource "aws_cloudfront_origin_access_identity" "ui" {
  comment = local.default-name
}

resource "aws_s3_bucket" "ui" {
  bucket = "${local.default-name}-ui"
  tags = local.default-tags
}

resource "aws_s3_bucket_public_access_block" "ui" {
  bucket = aws_s3_bucket.ui.id
  block_public_acls   = true
  block_public_policy = true
  ignore_public_acls = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ui" {
  bucket = aws_s3_bucket.ui.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_object" "ui" {
  bucket = aws_s3_bucket.ui.id
  for_each = fileset("../../../../web/build", "*")
  key = each.key
  source = "../../../../web/build/${each.key}"
  content_type = lookup(local.mime_types, element(split(".", each.key), length(split(".", each.key)) - 1))
  etag = filemd5("../../../../web/build/${each.key}")
  tags = local.default-tags
}

resource "aws_s3_object" "ui-config" {
  bucket = aws_s3_bucket.ui.id
  key = "config.js"
  source = "config.js"
  content_type = "application/javascript"
  etag = filemd5("config.js")
  tags = local.default-tags
}

resource "aws_s3_bucket_policy" "ui" {
  bucket = aws_s3_bucket.ui.bucket
  policy = jsonencode({
    "Version": "2008-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "AWS":  aws_cloudfront_origin_access_identity.ui.iam_arn
        },
        "Action": "s3:GetObject",
        "Resource": "${aws_s3_bucket.ui.arn}/*"
      }
    ]
  })
}

locals {
  mime_types = {
    "css"  = "text/css"
    "html" = "text/html"
    "ico"  = "image/vnd.microsoft.icon"
    "js"   = "application/javascript"
    "json" = "application/json"
    "map"  = "application/json"
    "png"  = "image/png"
    "svg"  = "image/svg+xml"
    "txt"  = "text/plain"
  }
}
