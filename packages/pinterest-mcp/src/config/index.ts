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
  serviceName: z.string().default("pinterest-mcp"),
  port: z.number().int().min(1).max(65535).default(3011),
  otelServiceName: z.string().default("pinterest-mcp"),

  // Auth — Pinterest-specific modes
  mcpAuthMode: z.enum(["pinterest-bearer", "jwt", "none"]).default("pinterest-bearer"),

  // Pinterest API Configuration
  pinterestApiBaseUrl: z
    .string()
    .url()
    .default("https://api.pinterest.com"),
  pinterestApiVersion: z.string().default("v5"),
  pinterestRateLimitPerMinute: z.number().default(100),

  // Stdio fallback: Pinterest access token and default ad account ID
  pinterestAccessToken: z.string().optional(),
  pinterestAdAccountId: z.string().optional(),

  // Refresh token flow: app credentials + refresh token (recommended for production)
  pinterestAppId: z.string().optional(),
  pinterestAppSecret: z.string().optional(),
  pinterestRefreshToken: z.string().optional(),

  // Reporting poll configuration
  pinterestReportPollIntervalMs: z.number().default(2_000),
  pinterestReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.PINTEREST_MCP_PORT ? Number(process.env.PINTEREST_MCP_PORT) : undefined,
    host: process.env.PINTEREST_MCP_HOST || defaultHost,

    // Pinterest API
    pinterestApiBaseUrl: process.env.PINTEREST_API_BASE_URL,
    pinterestApiVersion: process.env.PINTEREST_API_VERSION,
    pinterestRateLimitPerMinute: process.env.PINTEREST_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.PINTEREST_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN,
    pinterestAdAccountId: process.env.PINTEREST_AD_ACCOUNT_ID,

    // Refresh token flow credentials
    pinterestAppId: process.env.PINTEREST_APP_ID,
    pinterestAppSecret: process.env.PINTEREST_APP_SECRET,
    pinterestRefreshToken: process.env.PINTEREST_REFRESH_TOKEN,

    // Reporting poll configuration
    pinterestReportPollIntervalMs: process.env.PINTEREST_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.PINTEREST_REPORT_POLL_INTERVAL_MS)
      : undefined,
    pinterestReportMaxPollAttempts: process.env.PINTEREST_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.PINTEREST_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
