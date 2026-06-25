locals {
  project = "wigwag-415814"
  region  = "africa-south1"
  service = "stitch-coffee-dashboard"
  image   = "eu.gcr.io/wigwag-415814/stitch-coffee-dashboard:${var.STITCH_COFFEE_DASHBOARD_VERSION}"
}
