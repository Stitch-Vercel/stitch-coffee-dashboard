data "google_compute_network" "internal_private_network" {
  name    = "internal-private-network"
  project = local.project
}

resource "google_compute_subnetwork" "stitch_coffee_dashboard" {
  name                     = "stitch-coffee-dashboard-subnet"
  project                  = local.project
  region                   = local.region
  network                  = data.google_compute_network.internal_private_network.id
  ip_cidr_range            = "10.6.1.0/24"
  private_ip_google_access = true
}
