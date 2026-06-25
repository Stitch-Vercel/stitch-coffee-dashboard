locals {
  secrets = {
    DATABASE_URL = "STITCH_COFFEE_DASHBOARD_DATABASE_URL"
  }

  env_vars = {
    NODE_ENV    = "production"
    LOG_LEVEL   = "info"
    MERCHANT_ID = "519a484c-d7e2-42d8-b193-3315f7246d01"
  }
}
