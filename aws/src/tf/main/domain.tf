resource "aws_route53_record" "api" {
  zone_id = var.zone_id
  name    = aws_apigatewayv2_domain_name.main.domain_name
  type    = "A"
  alias {
    evaluate_target_health = true
    name = aws_apigatewayv2_domain_name.main.domain_name_configuration[0].target_domain_name
    zone_id = aws_apigatewayv2_domain_name.main.domain_name_configuration[0].hosted_zone_id
  }
}

resource "aws_acm_certificate" "api" {
  domain_name = local.api-domain-name
  validation_method = "DNS"
  tags = local.default-tags
}

resource "aws_route53_record" "api-validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.zone_id
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api-validation : record.fqdn]
}

resource "aws_route53_record" "ui" {
  zone_id = var.zone_id
  for_each = {
    for a in aws_cloudfront_distribution.main.aliases : a => {}
  }
  name    = each.key
  type    = "A"
  alias {
    evaluate_target_health = true
    name = aws_cloudfront_distribution.main.domain_name
    zone_id = aws_cloudfront_distribution.main.hosted_zone_id
  }
}

resource "aws_acm_certificate" "ui" {
  domain_name = local.ui-domain-name
  validation_method = "DNS"
  provider = aws.us-east-1
  tags = local.default-tags
}

resource "aws_route53_record" "ui-validation" {
  for_each = {
    for dvo in aws_acm_certificate.ui.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.zone_id
}

resource "aws_acm_certificate_validation" "ui" {
  certificate_arn         = aws_acm_certificate.ui.arn
  validation_record_fqdns = [for record in aws_route53_record.ui-validation : record.fqdn]
  provider = aws.us-east-1
}
