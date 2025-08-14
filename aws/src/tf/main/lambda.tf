locals {
  lambda-name = local.default-name
}

resource "aws_lambda_function" "main" {
  function_name = local.default-name
  runtime = "java21"
  package_type = "Zip"
  filename = "../../../build/layers/flight.zip"
  source_code_hash = filebase64sha256("../../../build/layers/flight.zip")
  handler = "se.daan.flight.Handler::handleRequest"
  layers = [aws_lambda_layer_version.main.arn]
  timeout = 30
  memory_size = 1024 # We don't need the memory, we do need the cpu
  role = aws_iam_role.lambda.arn
  environment {
    variables = {
      "FLIGHT_TABLE_NAME" = aws_dynamodb_table.main.name
      "FLIGHT_GOOGLE_CLIENT_ID" = var.google-client-id
    }
  }
  depends_on = [
    aws_iam_role_policy_attachment.lambda-logging
  ]
  tags = local.default-tags
}

resource "aws_lambda_layer_version" "main" {
  layer_name = local.default-name
  filename = "../../../build/layers/flight-lib.zip"
  source_code_hash = filebase64sha256("../../../build/layers/flight-lib.zip")
  compatible_runtimes = ["java21"]
}

resource "aws_lambda_permission" "main" {
  statement_id = "${local.default-name}-gateway"
  function_name = aws_lambda_function.main.function_name
  action        = "lambda:InvokeFunction"
  source_arn = "${aws_apigatewayv2_api.main.execution_arn}/*"
  principal     = "apigateway.amazonaws.com"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.lambda-name}"
  retention_in_days = 14
  tags = local.default-tags
}

resource "aws_iam_role" "lambda" {
  name = "${local.default-name}-lambda"
  assume_role_policy = jsonencode({
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "sts:AssumeRole",
        "Principal": {
          "Service": "lambda.amazonaws.com"
        },
        "Effect": "Allow",
      }
    ]
  })
  tags = local.default-tags
}

resource "aws_iam_policy" "lambda-logging" {
  name        = "${local.default-name}-lambda-logging"
  path        = "/"

  policy = jsonencode({
    "Version" = "2012-10-17",
    "Statement": [
      {
        "Action": [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        "Resource": "${aws_cloudwatch_log_group.lambda.arn}:*"
        "Effect": "Allow"
      }
    ]
  })
  tags = local.default-tags
}

resource "aws_iam_role_policy_attachment" "lambda-logging" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda-logging.arn
}

resource "aws_iam_policy" "lambda-dynamo" {
  name        = "${local.default-name}-lambda-dynamo"
  path        = "/"

  policy = jsonencode({
    "Version" = "2012-10-17",
    "Statement": [
      {
        "Action": [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ],
        "Resource": aws_dynamodb_table.main.arn
        "Effect": "Allow"
      }
    ]
  })
  tags = local.default-tags
}

resource "aws_iam_role_policy_attachment" "lambda-dynamo" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda-dynamo.arn
}