# Variables for Networking Module

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for networking resources"
  type        = string
  default     = "europe-west2"
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be dev or prod."
  }
}

variable "network_prefix" {
  description = "Prefix for network resource names"
  type        = string
  default     = "cesteral"
}

# ============================================================================
# VPC CONFIGURATION
# ============================================================================

variable "create_vpc" {
  description = "Create a new VPC network (true) or use existing (false)"
  type        = bool
  default     = true
}

variable "existing_vpc_name" {
  description = "Name of existing VPC to use (required if create_vpc = false)"
  type        = string
  default     = ""
}

variable "existing_subnet_name" {
  description = "Name of existing subnet for VPC connector (required if create_vpc = false)"
  type        = string
  default     = ""
}

variable "serverless_subnet_cidr" {
  description = "CIDR range for serverless VPC connector subnet"
  type        = string
  default     = "10.8.0.0/28" # Minimum /28 (16 IPs) required for VPC connector
}

# ============================================================================
# VPC ACCESS CONNECTOR CONFIGURATION
# ============================================================================

variable "connector_machine_type" {
  description = "Machine type for VPC Access Connector instances"
  type        = string
  default     = "e2-micro"
  validation {
    condition     = contains(["f1-micro", "e2-micro", "e2-standard-4"], var.connector_machine_type)
    error_message = "Machine type must be f1-micro, e2-micro, or e2-standard-4."
  }
}

variable "connector_min_instances" {
  description = "Minimum number of VPC connector instances"
  type        = number
  default     = 2
}

variable "connector_max_instances" {
  description = "Maximum number of VPC connector instances"
  type        = number
  default     = 3
}

variable "connector_min_throughput" {
  description = "Minimum throughput in Mbps (200-1000)"
  type        = number
  default     = 200
  validation {
    condition     = var.connector_min_throughput >= 200 && var.connector_min_throughput <= 1000
    error_message = "Min throughput must be between 200 and 1000 Mbps."
  }
}

variable "connector_max_throughput" {
  description = "Maximum throughput in Mbps (200-1000)"
  type        = number
  default     = 300
  validation {
    condition     = var.connector_max_throughput >= 200 && var.connector_max_throughput <= 1000
    error_message = "Max throughput must be between 200 and 1000 Mbps."
  }
}

# ============================================================================
# CLOUD NAT CONFIGURATION
# ============================================================================

variable "enable_nat_logging" {
  description = "Enable logging for Cloud NAT"
  type        = bool
  default     = true
}

variable "nat_log_filter" {
  description = "Log filter for Cloud NAT (ERRORS_ONLY, TRANSLATIONS_ONLY, ALL)"
  type        = string
  default     = "ERRORS_ONLY"
  validation {
    condition     = contains(["ERRORS_ONLY", "TRANSLATIONS_ONLY", "ALL"], var.nat_log_filter)
    error_message = "NAT log filter must be ERRORS_ONLY, TRANSLATIONS_ONLY, or ALL."
  }
}

variable "nat_min_ports_per_vm" {
  description = "Minimum number of ports allocated to a VM instance"
  type        = number
  default     = 64
}

variable "enable_endpoint_independent_mapping" {
  description = "Enable endpoint independent mapping for Cloud NAT"
  type        = bool
  default     = false
}
