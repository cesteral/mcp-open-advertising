// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { LINKEDIN_API_VERSION, isValidLinkedInApiVersion } from "./api-version.js";
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
  serviceName: z.string().default("linkedin-mcp"),
  port: z.number().int().min(1).max(65535).default(3006),
  otelServiceName: z.string().default("linkedin-mcp"),

  // Auth — LinkedIn-specific modes
  mcpAuthMode: z.enum(["linkedin-bearer", "jwt", "none"]).default("linkedin-bearer"),

  // LinkedIn API Configuration
  linkedinApiBaseUrl: z.string().url().default("https://api.linkedin.com"),
  // Pin lives in api-version.ts; the refine rejects a malformed override at boot
  // rather than letting an unparseable header reach LinkedIn as a 4xx per call.
  linkedinApiVersion: z
    .string()
    .refine(isValidLinkedInApiVersion, {
      message: "LINKEDIN_API_VERSION must be a YYYYMM version moniker, e.g. 202608",
    })
    .default(LINKEDIN_API_VERSION),
  // Conservative default: platform_quota / max_instances (10).
  // In-memory rate limiting is per-process; effective_limit = configured × instance_count.
  // Override via LINKEDIN_RATE_LIMIT_PER_MINUTE for different scaling profiles.
  linkedinRateLimitPerMinute: z.number().default(10),

  // Stdio fallback: LinkedIn access token from env vars
  linkedinAccessToken: z.string().optional(),

  // Refresh token flow: client credentials + refresh token (recommended for production)
  linkedinClientId: z.string().optional(),
  linkedinClientSecret: z.string().optional(),
  linkedinRefreshToken: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    ...(process.env.LINKEDIN_MCP_PORT ? { port: Number(process.env.LINKEDIN_MCP_PORT) } : {}),
    host: process.env.LINKEDIN_MCP_HOST || defaultHost,

    // LinkedIn API
    linkedinApiBaseUrl: process.env.LINKEDIN_API_BASE_URL,
    linkedinApiVersion: process.env.LINKEDIN_API_VERSION,
    linkedinRateLimitPerMinute: process.env.LINKEDIN_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.LINKEDIN_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    linkedinAccessToken: process.env.LINKEDIN_ACCESS_TOKEN,

    // Refresh token flow credentials
    linkedinClientId: process.env.LINKEDIN_CLIENT_ID,
    linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    linkedinRefreshToken: process.env.LINKEDIN_REFRESH_TOKEN,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
