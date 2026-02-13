# Networking Module for BidShifter MCP Server
# Includes: Serverless VPC Access Connector, Cloud NAT, VPC configuration

locals {
  network_name = var.create_vpc ? google_compute_network.vpc[0].name : var.existing_vpc_name
  common_labels = {
    application = "bidshifter"
    component   = "networking"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ============================================================================
# VPC NETWORK
# ============================================================================

# Create new VPC if requested
resource "google_compute_network" "vpc" {
  count = var.create_vpc ? 1 : 0

  name                    = "${var.network_prefix}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  description             = "VPC for BidShifter MCP Server"
}

# Create subnet for serverless connector
resource "google_compute_subnetwork" "serverless_subnet" {
  count = var.create_vpc ? 1 : 0

  name          = "${var.network_prefix}-serverless-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc[0].id
  ip_cidr_range = var.serverless_subnet_cidr

  description = "Subnet for Serverless VPC Access Connector"

  private_ip_google_access = true
}

# ============================================================================
# SERVERLESS VPC ACCESS CONNECTOR
# ============================================================================

resource "google_vpc_access_connector" "connector" {
  name    = "${var.network_prefix}-connector"
  project = var.project_id
  region  = var.region

  subnet {
    name    = var.create_vpc ? google_compute_subnetwork.serverless_subnet[0].name : var.existing_subnet_name
    project = var.project_id
  }

  machine_type  = var.connector_machine_type
  min_instances = var.connector_min_instances
  max_instances = var.connector_max_instances

  # Optional: Limit throughput
  min_throughput = var.connector_min_throughput
  max_throughput = var.connector_max_throughput
}

# ============================================================================
# CLOUD NAT (for egress to DV360 API, etc.)
# ============================================================================

# Cloud Router for NAT
resource "google_compute_router" "router" {
  name    = "${var.network_prefix}-router"
  project = var.project_id
  region  = var.region
  network = local.network_name

  description = "Cloud Router for NAT gateway"
}

# Cloud NAT configuration
resource "google_compute_router_nat" "nat" {
  name    = "${var.network_prefix}-nat"
  project = var.project_id
  region  = var.region
  router  = google_compute_router.router.name

  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = var.enable_nat_logging
    filter = var.nat_log_filter
  }

  # Optional: Min ports per VM
  min_ports_per_vm = var.nat_min_ports_per_vm

  # Optional: Enable endpoint independent mapping
  enable_endpoint_independent_mapping = var.enable_endpoint_independent_mapping
}

# ============================================================================
# FIREWALL RULES
# ============================================================================

# Allow egress to Google APIs (for DV360, Vertex AI, etc.)
resource "google_compute_firewall" "allow_google_apis" {
  count = var.create_vpc ? 1 : 0

  name    = "${var.network_prefix}-allow-google-apis"
  project = var.project_id
  network = google_compute_network.vpc[0].name

  description = "Allow egress to Google APIs"
  direction   = "EGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  destination_ranges = [
    "199.36.153.4/30",  # Private Google Access
    "199.36.153.8/30",  # Private Google Access
  ]

  target_tags = ["bidshifter"]
}

# Allow egress to external APIs (DV360, Bid Manager, Beam)
resource "google_compute_firewall" "allow_external_apis" {
  count = var.create_vpc ? 1 : 0

  name    = "${var.network_prefix}-allow-external-apis"
  project = var.project_id
  network = google_compute_network.vpc[0].name

  description = "Allow egress to external APIs"
  direction   = "EGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  destination_ranges = ["0.0.0.0/0"]

  target_tags = ["bidshifter"]
}

# Allow ingress from Cloud Scheduler
resource "google_compute_firewall" "allow_scheduler" {
  count = var.create_vpc && var.allow_scheduler_ingress ? 1 : 0

  name    = "${var.network_prefix}-allow-scheduler"
  project = var.project_id
  network = google_compute_network.vpc[0].name

  description = "Allow ingress from Cloud Scheduler"
  direction   = "INGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = [
    "0.0.0.0/0" # Cloud Scheduler uses dynamic IPs
  ]

  target_tags = ["bidshifter"]
}

# Allow health checks from Google Cloud load balancers
resource "google_compute_firewall" "allow_health_checks" {
  count = var.create_vpc ? 1 : 0

  name    = "${var.network_prefix}-allow-health-checks"
  project = var.project_id
  network = google_compute_network.vpc[0].name

  description = "Allow health checks from Google Cloud"
  direction   = "INGRESS"
  priority    = 1000

  allow {
    protocol = "tcp"
  }

  source_ranges = [
    "35.191.0.0/16",  # Google Cloud health check ranges
    "130.211.0.0/22",
  ]

  target_tags = ["bidshifter"]
}
