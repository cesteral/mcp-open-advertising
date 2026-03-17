output "uptime_check_ids" {
  description = "IDs of the created uptime checks"
  value       = { for k, v in google_monitoring_uptime_check_config.health : k => v.uptime_check_id }
}

output "alert_policy_ids" {
  description = "IDs of the created alert policies"
  value = merge(
    { for k, v in google_monitoring_alert_policy.error_rate : "${k}-error-rate" => v.name },
    { for k, v in google_monitoring_alert_policy.latency_p99 : "${k}-latency-p99" => v.name },
    { for k, v in google_monitoring_alert_policy.instance_count : "${k}-instance-count" => v.name },
    { for k, v in google_monitoring_alert_policy.uptime_failure : "${k}-uptime-failure" => v.name },
    { "audit-access-denied" = google_monitoring_alert_policy.audit_access_denied.name },
  )
}
