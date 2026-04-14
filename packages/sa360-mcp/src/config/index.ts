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
  serviceName: z.string().default("sa360-mcp"),
  port: z.number().int().min(1).max(65535).default(3010),
  otelServiceName: z.string().default("sa360-mcp"),

  // Auth — SA360-specific modes
  mcpAuthMode: z.enum(["sa360-headers", "jwt", "none"]).default("sa360-headers"),

  // SA360 API Configuration
  sa360ApiBaseUrl: z
    .string()
    .url()
    .default("https://searchads360.googleapis.com/v0"),
  sa360V2ApiBaseUrl: z
    .string()
    .url()
    .default("https://www.googleapis.com/doubleclicksearch/v2"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via SA360_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  sa360RateLimitPerMinute: z.number().default(10),

  // Stdio fallback: SA360 credentials from env vars
  sa360ClientId: z.string().optional(),
  sa360ClientSecret: z.string().optional(),
  sa360RefreshToken: z.string().optional(),
  sa360LoginCustomerId: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    ...(process.env.SA360_MCP_PORT ? { port: Number(process.env.SA360_MCP_PORT) } : {}),
    host: process.env.SA360_MCP_HOST || defaultHost,

    // SA360 API
    sa360ApiBaseUrl: process.env.SA360_API_BASE_URL,
    sa360V2ApiBaseUrl: process.env.SA360_V2_API_BASE_URL,
    sa360RateLimitPerMinute: process.env.SA360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.SA360_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    sa360ClientId: process.env.SA360_CLIENT_ID,
    sa360ClientSecret: process.env.SA360_CLIENT_SECRET,
    sa360RefreshToken: process.env.SA360_REFRESH_TOKEN,
    sa360LoginCustomerId: process.env.SA360_LOGIN_CUSTOMER_ID,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();