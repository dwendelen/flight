resource "aws_dynamodb_table" "main" {
  name     = local.default-name
  billing_mode = "PAY_PER_REQUEST"
  table_class = "STANDARD"
  hash_key = "pk"
  range_key = "sk"
  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  ttl {
    attribute_name = "ttl"
    enabled = true
  }

  tags = local.default-tags
}