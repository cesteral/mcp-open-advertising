# Global external Application Load Balancer fronting the MCP fleet.
#
# One host (var.domain) fans out to the per-platform Cloud Run services by
# path prefix: https://<domain>/<path_prefix>/mcp → <service>/mcp. The prefix
# is stripped before forwarding, so the services keep serving /mcp, /health,
# and /.well-known/* at their root exactly as they do on their run.app URLs.
#
# IAM still applies behind the LB: Cloud Run validates the ID token in
# X-Serverless-Authorization, and tokens minted for https://<domain> are
# accepted because every service lists that origin in custom_audiences
# (wired in the root module, not here).
#
# DNS is external (Cloudflare, DNS-only record). The managed certificate
# only provisions once <domain> resolves to this LB's IP, so first apply
# leaves the cert in PROVISIONING until the A record is added.

resource "google_compute_global_address" "fleet" {
  project = var.project_id
  name    = "mcp-fleet-lb-ip"
}

resource "google_compute_region_network_endpoint_group" "service" {
  for_each = var.services

  project               = var.project_id
  region                = var.region
  name                  = "${each.key}-neg"
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.key
  }
}

resource "google_compute_backend_service" "service" {
  for_each = var.services

  project               = var.project_id
  name                  = "${each.key}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.service[each.key].id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "fleet" {
  project         = var.project_id
  name            = "mcp-fleet-lb"
  description     = "Path-based routing for the MCP fleet (${var.environment})"
  default_service = null

  default_url_redirect {
    host_redirect          = var.redirect_host
    path_redirect          = "/"
    https_redirect         = true
    strip_query            = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }

  host_rule {
    hosts        = [var.domain]
    path_matcher = "fleet"
  }

  path_matcher {
    name = "fleet"

    default_url_redirect {
      host_redirect          = var.redirect_host
      path_redirect          = "/"
      https_redirect         = true
      strip_query            = true
      redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    }

    dynamic "route_rules" {
      for_each = { for idx, key in sort(keys(var.services)) : key => idx }

      content {
        priority = route_rules.value + 1
        service  = google_compute_backend_service.service[route_rules.key].id

        match_rules {
          prefix_match = "/${var.services[route_rules.key].path_prefix}/"
        }

        match_rules {
          full_path_match = "/${var.services[route_rules.key].path_prefix}"
        }

        route_action {
          url_rewrite {
            path_prefix_rewrite = "/"
          }
        }
      }
    }
  }
}

resource "google_compute_managed_ssl_certificate" "fleet" {
  project = var.project_id
  name    = "mcp-fleet-cert"

  managed {
    domains = [var.domain]
  }
}

resource "google_compute_ssl_policy" "fleet" {
  project         = var.project_id
  name            = "mcp-fleet-ssl-policy"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_target_https_proxy" "fleet" {
  project          = var.project_id
  name             = "mcp-fleet-https-proxy"
  url_map          = google_compute_url_map.fleet.id
  ssl_certificates = [google_compute_managed_ssl_certificate.fleet.id]
  ssl_policy       = google_compute_ssl_policy.fleet.id
}

resource "google_compute_global_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "mcp-fleet-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.fleet.address
  port_range            = "443"
  target                = google_compute_target_https_proxy.fleet.id
}

# Port 80 exists only to bounce clients to HTTPS — no backend is reachable
# over plain HTTP.
resource "google_compute_url_map" "https_redirect" {
  project = var.project_id
  name    = "mcp-fleet-https-redirect"

  default_url_redirect {
    https_redirect         = true
    strip_query            = false
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
  }
}

resource "google_compute_target_http_proxy" "https_redirect" {
  project = var.project_id
  name    = "mcp-fleet-http-proxy"
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  project               = var.project_id
  name                  = "mcp-fleet-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.fleet.address
  port_range            = "80"
  target                = google_compute_target_http_proxy.https_redirect.id
}
