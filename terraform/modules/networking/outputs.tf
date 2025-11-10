# Outputs for Networking Module

output "vpc_name" {
  description = "Name of the VPC network"
  value       = local.network_name
}

output "vpc_id" {
  description = "ID of the VPC network"
  value       = var.create_vpc ? google_compute_network.vpc[0].id : null
}

output "vpc_self_link" {
  description = "Self-link of the VPC network"
  value       = var.create_vpc ? google_compute_network.vpc[0].self_link : null
}

output "serverless_subnet_name" {
  description = "Name of the serverless subnet"
  value       = var.create_vpc ? google_compute_subnetwork.serverless_subnet[0].name : var.existing_subnet_name
}

output "serverless_subnet_cidr" {
  description = "CIDR range of the serverless subnet"
  value       = var.create_vpc ? google_compute_subnetwork.serverless_subnet[0].ip_cidr_range : null
}

output "vpc_connector_name" {
  description = "Name of the VPC Access Connector"
  value       = google_vpc_access_connector.connector.name
}

output "vpc_connector_id" {
  description = "Full resource ID of the VPC Access Connector"
  value       = google_vpc_access_connector.connector.id
}

output "vpc_connector_self_link" {
  description = "Self-link of the VPC Access Connector"
  value       = google_vpc_access_connector.connector.self_link
}

output "cloud_router_name" {
  description = "Name of the Cloud Router"
  value       = google_compute_router.router.name
}

output "cloud_nat_name" {
  description = "Name of the Cloud NAT"
  value       = google_compute_router_nat.nat.name
}

output "nat_ip_addresses" {
  description = "NAT IP addresses allocated (if static)"
  value       = google_compute_router_nat.nat.nat_ips
}
