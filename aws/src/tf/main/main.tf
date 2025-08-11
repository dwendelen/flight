terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "~>5.46"
    }
  }
}

provider "aws" {
  profile = "default"
  region = "eu-central-1"
}

provider "aws" {
  alias = "us-east-1"
  profile = "default"
  region = "us-east-1"
}

variable "environment" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "ui-cache-policy-id" {
  type = string
}

variable "domain" {
  type = string
}

variable "extra-allowed-origins" {
  type = list(string)
  default = []
}

locals {
  default-name = "flight-${var.environment}"
  ui-domain-name = var.domain
  api-domain-name = "api.${var.domain}"
  default-tags = {
    application: "flight"
    environment: var.environment
  }
}
