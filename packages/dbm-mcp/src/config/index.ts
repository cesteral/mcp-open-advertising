// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  loadDotEnv,
  BaseConfigSchema,
  getBaseEnvConfig,
  parseConfigWithSchema,
  getDefaultHost,
} from "@cesteral/shared";

// Load .env file from package root
loadDotEnv();

/**
 * Configuration schema with Zod validation
 * Based on Phase 2 architecture requirements for Bid Manager API
 */
const ConfigSchema = BaseConfigSchema.extend({
  // Defaults for this server
  serviceName: z.string().default("dbm-mcp"),
  port: z.number().int().min(1).max(65535).default(3001),
  otelServiceName: z.string().default("dbm-mcp"),

  // Auth — Google-specific modes
  mcpAuthMode: z.enum(["google-headers", "jwt", "none"]).default("google-headers"),

  // Google Cloud
  gcpProjectId: z.string().optional(),

  // Stdio-mode fallback credentials (env vars only, not used in HTTP mode)
  serviceAccountJson: z.string().optional(), // Base64 encoded service account JSON
  serviceAccountFile: z.string().optional(), // Path to service account JSON file

  // Rate Limiting
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via RATE_LIMIT_PER_MINUTE for different scaling profiles.
  rateLimitPerMinute: z.number().default(10),

  // Report Settings (Bid Manager async reports with exponential backoff)
  reportCacheTtlMs: z.number().default(300000), // 5 minute cache
  reportPollMaxRetries: z.number().default(10), // Max polling attempts
  reportPollInitialDelayMs: z.number().default(2000), // Initial backoff delay (2s)
  reportPollMaxDelayMs: z.number().default(60000), // Max backoff delay (60s)
  reportQueryRetries: z.number().default(3), // High-level query retries
  reportRetryCooldownMs: z.number().default(60000), // Delay before retry (60s)
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration from environment variables
 */
export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.DBM_MCP_PORT ? Number(process.env.DBM_MCP_PORT) : undefined,
    host: process.env.DBM_MCP_HOST || defaultHost,

    // Google Cloud
    gcpProjectId: process.env.GCP_PROJECT_ID,

    // Stdio-mode fallback credentials
    serviceAccountJson: process.env.SERVICE_ACCOUNT_JSON,
    serviceAccountFile: process.env.SERVICE_ACCOUNT_FILE,

    // Rate Limiting
    rateLimitPerMinute: process.env.RATE_LIMIT_PER_MINUTE
      ? Number(process.env.RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Report Settings
    reportCacheTtlMs: process.env.REPORT_CACHE_TTL_MS
      ? Number(process.env.REPORT_CACHE_TTL_MS)
      : undefined,
    reportPollMaxRetries: process.env.REPORT_POLL_MAX_RETRIES
      ? Number(process.env.REPORT_POLL_MAX_RETRIES)
      : undefined,
    reportPollInitialDelayMs: process.env.REPORT_POLL_INITIAL_DELAY_MS
      ? Number(process.env.REPORT_POLL_INITIAL_DELAY_MS)
      : undefined,
    reportPollMaxDelayMs: process.env.REPORT_POLL_MAX_DELAY_MS
      ? Number(process.env.REPORT_POLL_MAX_DELAY_MS)
      : undefined,
    reportQueryRetries: process.env.REPORT_QUERY_RETRIES
      ? Number(process.env.REPORT_QUERY_RETRIES)
      : undefined,
    reportRetryCooldownMs: process.env.REPORT_RETRY_COOLDOWN_MS
      ? Number(process.env.REPORT_RETRY_COOLDOWN_MS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

/**
 * Global configuration instance
 */
export const mcpConfig = parseConfig();