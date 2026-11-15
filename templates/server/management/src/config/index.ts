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
  serviceName: z.string().default("{{package}}"),
  port: z.number().int().min(1).max(65535).default({{port}}),
  otelServiceName: z.string().default("{{package}}"),

  mcpAuthMode: z.enum(["{{key}}-bearer", "jwt", "none"]).default("{{key}}-bearer"),

  // {{displayName}} API. Both values are platform facts (platform-facts.json).
  apiBaseUrl: z.string().url().default("{{baseUrl}}"),
  // Per-process: effective limit = configured x instance count (assume 10).
  rateLimitPerMinute: z.number().default({{rateLimitPerMinute}}),

  // Stdio fallback credentials
  accessToken: z.string().optional(),
  accountId: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    serviceName: process.env.SERVICE_NAME,
    ...(process.env.{{ENV}}_MCP_PORT ? { port: Number(process.env.{{ENV}}_MCP_PORT) } : {}),
    host: process.env.{{ENV}}_MCP_HOST || defaultHost,

    apiBaseUrl: process.env.{{ENV}}_API_BASE_URL,
    rateLimitPerMinute: process.env.{{ENV}}_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.{{ENV}}_RATE_LIMIT_PER_MINUTE)
      : undefined,

    accessToken: process.env.{{ENV}}_ACCESS_TOKEN,
    accountId: process.env.{{ENV}}_ACCOUNT_ID,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
