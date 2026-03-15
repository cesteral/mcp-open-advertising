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
  serviceName: z.string().default("tiktok-mcp"),
  port: z.number().int().min(1).max(65535).default(3007),
  otelServiceName: z.string().default("tiktok-mcp"),

  // Auth — TikTok-specific modes
  mcpAuthMode: z.enum(["tiktok-bearer", "jwt", "none"]).default("tiktok-bearer"),

  // TikTok API Configuration
  tiktokApiBaseUrl: z
    .string()
    .url()
    .default("https://business-api.tiktok.com"),
  tiktokApiVersion: z.string().default("v1.3"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via TIKTOK_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  tiktokRateLimitPerMinute: z.number().default(10),

  // Stdio fallback: TikTok access token and default advertiser ID
  tiktokAccessToken: z.string().optional(),
  tiktokAdvertiserId: z.string().optional(),

  // Refresh token flow: app credentials + refresh token (recommended for production)
  tiktokAppId: z.string().optional(),
  tiktokAppSecret: z.string().optional(),
  tiktokRefreshToken: z.string().optional(),

  // Reporting poll configuration
  tiktokReportPollIntervalMs: z.number().default(2_000),
  tiktokReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.TIKTOK_MCP_PORT ? Number(process.env.TIKTOK_MCP_PORT) : undefined,
    host: process.env.TIKTOK_MCP_HOST || defaultHost,

    // TikTok API
    tiktokApiBaseUrl: process.env.TIKTOK_API_BASE_URL,
    tiktokApiVersion: process.env.TIKTOK_API_VERSION,
    tiktokRateLimitPerMinute: process.env.TIKTOK_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.TIKTOK_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN,
    tiktokAdvertiserId: process.env.TIKTOK_ADVERTISER_ID,

    // Refresh token flow credentials
    tiktokAppId: process.env.TIKTOK_APP_ID,
    tiktokAppSecret: process.env.TIKTOK_APP_SECRET,
    tiktokRefreshToken: process.env.TIKTOK_REFRESH_TOKEN,

    // Reporting poll configuration
    tiktokReportPollIntervalMs: process.env.TIKTOK_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.TIKTOK_REPORT_POLL_INTERVAL_MS)
      : undefined,
    tiktokReportMaxPollAttempts: process.env.TIKTOK_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.TIKTOK_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();