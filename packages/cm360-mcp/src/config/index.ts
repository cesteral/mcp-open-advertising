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

loadDotEnv();

const ConfigSchema = BaseConfigSchema.extend({
  serviceName: z.string().default("cm360-mcp"),
  port: z.number().int().min(1).max(65535).default(3008),
  otelServiceName: z.string().default("cm360-mcp"),
  mcpAuthMode: z.enum(["google-headers", "jwt", "none"]).default("google-headers"),
  cm360ApiBaseUrl: z
    .string()
    .url()
    .default("https://dfareporting.googleapis.com/dfareporting/v5"),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via CM360_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  cm360RateLimitPerMinute: z.number().default(5),
  cm360ServiceAccountJson: z.string().optional(),
  cm360ServiceAccountFile: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();
  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),
    serviceName: process.env.SERVICE_NAME,
    port: process.env.CM360_MCP_PORT ? Number(process.env.CM360_MCP_PORT) : undefined,
    host: process.env.CM360_MCP_HOST || defaultHost,
    cm360ApiBaseUrl: process.env.CM360_API_BASE_URL,
    cm360RateLimitPerMinute: process.env.CM360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.CM360_RATE_LIMIT_PER_MINUTE)
      : undefined,
    cm360ServiceAccountJson: process.env.CM360_SERVICE_ACCOUNT_JSON,
    cm360ServiceAccountFile: process.env.CM360_SERVICE_ACCOUNT_FILE,
  };
  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();