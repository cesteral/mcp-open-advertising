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

const ConfigSchema = BaseConfigSchema.extend({
  // Defaults for this server
  serviceName: z.string().default("gads-mcp"),
  port: z.number().int().min(1).max(65535).default(3004),
  otelServiceName: z.string().default("gads-mcp"),

  // Auth — Google Ads-specific modes
  mcpAuthMode: z.enum(["gads-headers", "jwt", "none"]).default("gads-headers"),

  // Google Ads API Configuration
  gadsApiBaseUrl: z.string().url().default("https://googleads.googleapis.com/v23"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via GADS_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  gadsRateLimitPerMinute: z.number().default(10),

  // Stdio fallback: Google Ads credentials from env vars
  gadsDeveloperToken: z.string().optional(),
  gadsClientId: z.string().optional(),
  gadsClientSecret: z.string().optional(),
  gadsRefreshToken: z.string().optional(),
  gadsLoginCustomerId: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    ...(process.env.GADS_MCP_PORT ? { port: Number(process.env.GADS_MCP_PORT) } : {}),
    host: process.env.GADS_MCP_HOST || defaultHost,

    // Google Ads API
    gadsApiBaseUrl: process.env.GADS_API_BASE_URL,
    gadsRateLimitPerMinute: process.env.GADS_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.GADS_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    gadsDeveloperToken: process.env.GADS_DEVELOPER_TOKEN,
    gadsClientId: process.env.GADS_CLIENT_ID,
    gadsClientSecret: process.env.GADS_CLIENT_SECRET,
    gadsRefreshToken: process.env.GADS_REFRESH_TOKEN,
    gadsLoginCustomerId: process.env.GADS_LOGIN_CUSTOMER_ID,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
