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
 *
 * Note: Google API credentials are now provided by the end-user via HTTP
 * headers at connection time (see streamable-http-transport.ts). The server no
 * longer owns a service account.
 */
const ConfigSchema = BaseConfigSchema.extend({
  // Defaults for this server
  serviceName: z.string().default("dv360-mcp"),
  port: z.number().int().min(1).max(65535).default(3002),
  otelServiceName: z.string().default("dv360-mcp"),

  // Auth — Google-specific modes
  mcpAuthMode: z.enum(["google-headers", "jwt", "none"]).default("google-headers"),

  // DV360 API Configuration
  dv360ApiBaseUrl: z
    .string()
    .url()
    .default("https://displayvideo.googleapis.com/v4"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via DV360_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  dv360RateLimitPerMinute: z.number().default(6),

  // Stdio fallback: service account credentials from env vars
  // Used only in stdio transport mode (e.g., Claude Desktop local)
  dv360ServiceAccountJson: z.string().optional(),
  dv360ServiceAccountFile: z.string().optional(),
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
    port: process.env.DV360_MCP_PORT ? Number(process.env.DV360_MCP_PORT) : undefined,
    host: process.env.DV360_MCP_HOST || defaultHost,

    // DV360 API
    dv360ApiBaseUrl: process.env.DV360_API_BASE_URL,
    dv360RateLimitPerMinute: process.env.DV360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.DV360_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    dv360ServiceAccountJson: process.env.DV360_SERVICE_ACCOUNT_JSON,
    dv360ServiceAccountFile: process.env.DV360_SERVICE_ACCOUNT_FILE,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

/**
 * Global configuration instance
 */
export const mcpConfig = parseConfig();