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
  serviceName: z.string().default("snapchat-mcp"),
  port: z.number().int().min(1).max(65535).default(3009),
  otelServiceName: z.string().default("snapchat-mcp"),

  // Auth — Snapchat-specific modes
  mcpAuthMode: z.enum(["snapchat-bearer", "jwt", "none"]).default("snapchat-bearer"),

  // Snapchat API Configuration
  snapchatApiBaseUrl: z
    .string()
    .url()
    .default("https://adsapi.snapchat.com"),
  snapchatApiVersion: z.string().default("v1"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via SNAPCHAT_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  snapchatRateLimitPerMinute: z.number().default(10),

  // Stdio fallback: Snapchat access token, ad account ID, and org ID
  snapchatAccessToken: z.string().optional(),
  snapchatAdAccountId: z.string().optional(),
  snapchatOrgId: z.string().optional(),

  // Refresh token flow: app credentials + refresh token (recommended for production)
  snapchatAppId: z.string().optional(),
  snapchatAppSecret: z.string().optional(),
  snapchatRefreshToken: z.string().optional(),

  // Reporting poll configuration
  snapchatReportPollIntervalMs: z.number().default(2_000),
  snapchatReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.SNAPCHAT_MCP_PORT ? Number(process.env.SNAPCHAT_MCP_PORT) : undefined,
    host: process.env.SNAPCHAT_MCP_HOST || defaultHost,

    // Snapchat API
    snapchatApiBaseUrl: process.env.SNAPCHAT_API_BASE_URL,
    snapchatApiVersion: process.env.SNAPCHAT_API_VERSION,
    snapchatRateLimitPerMinute: process.env.SNAPCHAT_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.SNAPCHAT_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    snapchatAccessToken: process.env.SNAPCHAT_ACCESS_TOKEN,
    snapchatAdAccountId: process.env.SNAPCHAT_AD_ACCOUNT_ID,
    snapchatOrgId: process.env.SNAPCHAT_ORG_ID,

    // Refresh token flow credentials
    snapchatAppId: process.env.SNAPCHAT_APP_ID,
    snapchatAppSecret: process.env.SNAPCHAT_APP_SECRET,
    snapchatRefreshToken: process.env.SNAPCHAT_REFRESH_TOKEN,

    // Reporting poll configuration
    snapchatReportPollIntervalMs: process.env.SNAPCHAT_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.SNAPCHAT_REPORT_POLL_INTERVAL_MS)
      : undefined,
    snapchatReportMaxPollAttempts: process.env.SNAPCHAT_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.SNAPCHAT_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();