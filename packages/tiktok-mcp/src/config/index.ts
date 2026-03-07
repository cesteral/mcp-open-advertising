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
  tiktokRateLimitPerMinute: z.number().default(100),

  // Stdio fallback: TikTok access token and default advertiser ID
  tiktokAccessToken: z.string().optional(),
  tiktokAdvertiserId: z.string().optional(),

  // Refresh token flow: app credentials + refresh token (recommended for production)
  tiktokAppId: z.string().optional(),
  tiktokAppSecret: z.string().optional(),
  tiktokRefreshToken: z.string().optional(),
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
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();

export const appConfig: AppConfig = mcpConfig;
