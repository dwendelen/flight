terraform {
  backend "s3" {
    bucket = "flight-tf-state"
    key = "prd"
    region = "eu-central-1"
  }
}

module "main" {
  source = "../main"
  environment = "prd"
  domain = "flight.daan.se"
  zone_id = "Z03939243KT7G9JBEYEX5"
  ui-cache-policy-id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  google-client-id = "839023208446-b5mq4cjolsaa9km97sjntlm0m8gglfjh.apps.googleusercontent.com"
}
