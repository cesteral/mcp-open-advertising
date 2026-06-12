output "ip_address" {
  description = "Global IP of the load balancer — point the domain's A record here (DNS-only / unproxied)"
  value       = google_compute_global_address.fleet.address
}

output "domain" {
  description = "Domain the fleet is served under"
  value       = var.domain
}

output "certificate_id" {
  description = "Managed SSL certificate ID (provisioning blocks until DNS resolves to the LB IP)"
  value       = google_compute_managed_ssl_certificate.fleet.id
}

output "service_urls" {
  description = "Public per-service base URLs behind the load balancer"
  value = {
    for key, svc in var.services : key => "https://${var.domain}/${svc.path_prefix}"
  }
}
