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
  serviceName: z.string().default("amazon-dsp-mcp"),
  port: z.number().int().min(1).max(65535).default(3012),
  otelServiceName: z.string().default("amazon-dsp-mcp"),

  // Auth — Amazon DSP-specific modes
  mcpAuthMode: z.enum(["amazon-dsp-bearer", "jwt", "none"]).default("amazon-dsp-bearer"),

  // Amazon DSP API Configuration
  amazonDspApiBaseUrl: z.string().url().default("https://advertising-api.amazon.com"),
  amazonDspApiVersion: z.string().default("dsp"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via AMAZON_DSP_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  amazonDspRateLimitPerMinute: z.number().default(10),

  // Stdio fallback: Amazon DSP access token and default profile ID
  amazonDspAccessToken: z.string().optional(),
  amazonDspProfileId: z.string().optional(),
  amazonDspClientId: z.string().optional(),

  // Refresh token flow: app credentials + refresh token (recommended for production)
  amazonDspAppId: z.string().optional(),
  amazonDspAppSecret: z.string().optional(),
  amazonDspRefreshToken: z.string().optional(),
  // Opt-in age tracking for the env-configured refresh token. Amazon expires
  // refresh tokens 365 days after issuance for consent granted on/after
  // 2026-07-30 (campaign_management + audiences scopes). Set the ISO date the
  // token was issued to get a startup warning and /health exposure once the
  // token needs re-authorization. Only meaningful for the env token — HTTP
  // sessions bring their own refresh tokens whose age the server cannot know.
  amazonDspRefreshTokenIssuedAt: z.string().optional(),
  amazonDspRefreshTokenWarnAgeDays: z.number().int().min(1).default(335),

  // Reporting poll configuration
  amazonDspReportPollIntervalMs: z.number().default(2_000),
  amazonDspReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    ...(process.env.AMAZON_DSP_MCP_PORT ? { port: Number(process.env.AMAZON_DSP_MCP_PORT) } : {}),
    host: process.env.AMAZON_DSP_MCP_HOST || defaultHost,

    // AmazonDsp API
    amazonDspApiBaseUrl: process.env.AMAZON_DSP_API_BASE_URL,
    amazonDspApiVersion: process.env.AMAZON_DSP_API_VERSION,
    amazonDspRateLimitPerMinute: process.env.AMAZON_DSP_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.AMAZON_DSP_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    amazonDspAccessToken: process.env.AMAZON_DSP_ACCESS_TOKEN,
    amazonDspProfileId: process.env.AMAZON_DSP_PROFILE_ID,
    amazonDspClientId: process.env.AMAZON_DSP_CLIENT_ID,

    // Refresh token flow credentials
    amazonDspAppId: process.env.AMAZON_DSP_APP_ID,
    amazonDspAppSecret: process.env.AMAZON_DSP_APP_SECRET,
    amazonDspRefreshToken: process.env.AMAZON_DSP_REFRESH_TOKEN,
    amazonDspRefreshTokenIssuedAt: process.env.AMAZON_DSP_REFRESH_TOKEN_ISSUED_AT,
    amazonDspRefreshTokenWarnAgeDays: process.env.AMAZON_DSP_REFRESH_TOKEN_WARN_AGE_DAYS
      ? Number(process.env.AMAZON_DSP_REFRESH_TOKEN_WARN_AGE_DAYS)
      : undefined,

    // Reporting poll configuration
    amazonDspReportPollIntervalMs: process.env.AMAZON_DSP_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.AMAZON_DSP_REPORT_POLL_INTERVAL_MS)
      : undefined,
    amazonDspReportMaxPollAttempts: process.env.AMAZON_DSP_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.AMAZON_DSP_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
