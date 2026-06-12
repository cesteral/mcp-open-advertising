variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "Region hosting the Cloud Run services (serverless NEGs are regional)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "domain" {
  description = "Fully qualified domain the fleet is served under (e.g. mcp.cesteral.com)"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.domain))
    error_message = "domain must be a bare FQDN (no scheme, no path, no trailing dot)."
  }
}

variable "services" {
  description = <<-EOT
    Cloud Run services routed by the load balancer, keyed by service name.
    path_prefix is the first URL segment (no slashes): requests to
    /<path_prefix>/* are forwarded to the service with the prefix stripped,
    so /<path_prefix>/mcp reaches the service as /mcp.
  EOT
  type = map(object({
    path_prefix = string
  }))

  validation {
    condition     = alltrue([for s in values(var.services) : can(regex("^[a-z0-9-]+$", s.path_prefix))])
    error_message = "path_prefix must be a single lowercase URL segment (a-z, 0-9, hyphen)."
  }

  validation {
    condition     = length(distinct([for s in values(var.services) : s.path_prefix])) == length(var.services)
    error_message = "path_prefix values must be unique across services."
  }
}

variable "redirect_host" {
  description = "Host unmatched paths are redirected to (the public website). A URL map requires a default target, and redirecting off-host avoids exposing any one service on unknown paths."
  type        = string

  validation {
    condition     = length(var.redirect_host) > 0
    error_message = "redirect_host is required."
  }
}

