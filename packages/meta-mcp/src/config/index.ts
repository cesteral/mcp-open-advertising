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
  serviceName: z.string().default("meta-mcp"),
  port: z.number().int().min(1).max(65535).default(3005),
  otelServiceName: z.string().default("meta-mcp"),

  // Auth — Meta-specific modes
  mcpAuthMode: z.enum(["meta-bearer", "jwt", "none"]).default("meta-bearer"),

  // Meta API Configuration
  metaApiBaseUrl: z
    .string()
    .url()
    .default("https://graph.facebook.com/v22.0"),
  metaApiVersion: z.string().default("v22.0"),
  metaRateLimitPerMinute: z.number().default(200),

  // Stdio fallback: Meta access token from env vars
  metaAccessToken: z.string().optional(),

  // Optional: for token debug endpoint
  metaAppId: z.string().optional(),
  metaAppSecret: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.META_MCP_PORT ? Number(process.env.META_MCP_PORT) : undefined,
    host: process.env.META_MCP_HOST || defaultHost,

    // Meta API
    metaApiBaseUrl: process.env.META_API_BASE_URL,
    metaApiVersion: process.env.META_API_VERSION,
    metaRateLimitPerMinute: process.env.META_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.META_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    metaAccessToken: process.env.META_ACCESS_TOKEN,

    // Optional
    metaAppId: process.env.META_APP_ID,
    metaAppSecret: process.env.META_APP_SECRET,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();

export const appConfig: AppConfig = mcpConfig;
