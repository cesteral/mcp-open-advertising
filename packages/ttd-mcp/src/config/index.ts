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
  mcpAuthMode: z.enum(["ttd-headers", "jwt", "none"]).default("ttd-headers"),

  // TTD API Configuration
  ttdApiBaseUrl: z
    .string()
    .url()
    .default("https://api.thetradedesk.com/v3"),
  ttdAuthUrl: z
    .string()
    .url()
    .default("https://auth.thetradedesk.com/oauth2/token"),
  ttdRateLimitPerMinute: z.number().default(100),

  // Stdio fallback: TTD credentials from env vars
  ttdPartnerId: z.string().optional(),
  ttdApiSecret: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    // Server-specific overrides
    serviceName: process.env.SERVICE_NAME,
    port: process.env.TTD_MCP_PORT ? Number(process.env.TTD_MCP_PORT) : undefined,
    host: process.env.TTD_MCP_HOST || defaultHost,

    // TTD API
    ttdApiBaseUrl: process.env.TTD_API_BASE_URL,
    ttdAuthUrl: process.env.TTD_AUTH_URL,
    ttdRateLimitPerMinute: process.env.TTD_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.TTD_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    ttdPartnerId: process.env.TTD_PARTNER_ID,
    ttdApiSecret: process.env.TTD_API_SECRET,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();

export const appConfig: AppConfig = mcpConfig;
