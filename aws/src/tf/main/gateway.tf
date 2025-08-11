locals {
  routes = [
    { method = "POST", path = "/ping" },
    { method = "POST", path = "/pdf" },
  ]
}

resource "aws_apigatewayv2_api" "main" {
  name = local.default-name
  protocol_type = "HTTP"
  cors_configuration {
    allow_methods = [for r in local.routes: r.method]
    allow_headers = ["authorization", "content-type", "if-match"]
    allow_origins = concat(["https://${local.ui-domain-name}"], var.extra-allowed-origins)
    max_age = 300
  }
  tags = local.default-tags
}

resource "aws_apigatewayv2_stage" "main" {
  api_id = aws_apigatewayv2_api.main.id
  name   = "$default"
  auto_deploy = true
  tags = local.default-tags
}

resource "aws_apigatewayv2_route" "main" {
  api_id    = aws_apigatewayv2_api.main.id
  for_each = {
    for r in local.routes: "${r.method} ${r.path}" => {}
  }
  route_key = each.key
  target = "integrations/${aws_apigatewayv2_integration.main.id}"
}

resource "aws_apigatewayv2_integration" "main" {
  api_id = aws_apigatewayv2_api.main.id
  connection_type = "INTERNET"
  integration_method = "POST"
  integration_type = "AWS_PROXY"
  integration_uri = aws_lambda_function.main.arn
  payload_format_version = "2.0"
  timeout_milliseconds = 30000
}

resource "aws_apigatewayv2_domain_name" "main" {
  domain_name = local.api-domain-name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
  tags = local.default-tags
}

resource "aws_apigatewayv2_api_mapping" "main" {
  api_id      = aws_apigatewayv2_stage.main.api_id
  domain_name = aws_apigatewayv2_domain_name.main.id
  stage       = aws_apigatewayv2_stage.main.name
}
