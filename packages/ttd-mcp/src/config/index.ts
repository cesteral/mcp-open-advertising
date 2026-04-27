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
  serviceName: z.string().default("ttd-mcp"),
  port: z.number().int().min(1).max(65535).default(3003),
  otelServiceName: z.string().default("ttd-mcp"),

  // Auth — TTD-specific modes
  // `ttd-token` and `ttd-headers` are aliases — both expect the TTD API token
  // via the `TTD-Auth` request header. Two names exist because prior Terraform
  // defaults and CLAUDE.md settled on different labels; keeping both avoids
  // breaking either call site.
  mcpAuthMode: z.enum(["ttd-token", "ttd-headers", "jwt", "none"]).default("ttd-token"),

  // TTD API Configuration
  ttdApiBaseUrl: z.string().url().default("https://api.thetradedesk.com/v3"),
  ttdGraphqlUrl: z.string().url().default("https://desk.thetradedesk.com/graphql"),
  // Default: 60 req/min (1 req/s) — covers agentic discovery chains (partners →
  // advertisers → campaigns → ad groups) without hitting platform quotas.
  // In-memory rate limiting is per-process; multi-instance deployments should set
  // TTD_RATE_LIMIT_PER_MINUTE = platform_quota / instance_count.
  ttdRateLimitPerMinute: z.number().default(60),

  // Provide a pre-existing TTD-Auth token directly
  ttdApiToken: z.string().optional(),

  // Report polling configuration
  ttdReportPollIntervalMs: z.number().int().min(1000).default(2000),
  ttdReportMaxPollAttempts: z.number().int().min(1).default(60),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    ...(process.env.TTD_MCP_PORT ? { port: Number(process.env.TTD_MCP_PORT) } : {}),
    host: process.env.TTD_MCP_HOST || defaultHost,

    // TTD API
    ttdApiBaseUrl: process.env.TTD_API_BASE_URL,
    ttdGraphqlUrl: process.env.TTD_GRAPHQL_URL,
    ttdRateLimitPerMinute: process.env.TTD_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.TTD_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    ttdApiToken: process.env.TTD_API_TOKEN,

    // Report polling
    ttdReportPollIntervalMs: process.env.TTD_REPORT_POLL_INTERVAL_MS
      ? parseInt(process.env.TTD_REPORT_POLL_INTERVAL_MS, 10)
      : undefined,
    ttdReportMaxPollAttempts: process.env.TTD_REPORT_MAX_POLL_ATTEMPTS
      ? parseInt(process.env.TTD_REPORT_MAX_POLL_ATTEMPTS, 10)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
