import { config } from "dotenv";
import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";

// Load .env file from package root
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  if (result.parsed) {
    process.stderr.write(`[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`);
  }
} else {
  process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
}

const ConfigSchema = z.object({
  // Service Identity
  serviceName: z.string().default("ttd-mcp"),
  port: z.number().int().min(1).max(65535).default(3003),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Session Management
  mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),
  mcpStatefulSessionTimeoutMs: z.number().default(3600000), // 1 hour

  // Auth — TTD-specific modes
  mcpAuthMode: z.enum(["ttd-headers", "jwt", "none"]).default("ttd-headers"),
  mcpAuthSecretKey: z.string().optional(),

  // CORS Configuration
  mcpAllowedOrigins: z.string().optional(),

  // Logging
  logLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("info"),
  mcpLogLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("debug"),

  // OpenTelemetry
  otelEnabled: z.boolean().default(false),
  otelServiceName: z.string().default("ttd-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),

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
  // MCP Spec 2025-11-25: bind to localhost in development
  const defaultHost = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

  const rawConfig = {
    serviceName: process.env.SERVICE_NAME,
    port: process.env.TTD_MCP_PORT ? Number(process.env.TTD_MCP_PORT) : undefined,
    host: process.env.TTD_MCP_HOST || defaultHost,
    nodeEnv: process.env.NODE_ENV,

    // Session
    mcpSessionMode: process.env.MCP_SESSION_MODE,
    mcpStatefulSessionTimeoutMs: process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS
      ? Number(process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS)
      : undefined,

    // Auth
    mcpAuthMode: process.env.MCP_AUTH_MODE,
    mcpAuthSecretKey: process.env.MCP_AUTH_SECRET_KEY,

    // CORS
    mcpAllowedOrigins: process.env.MCP_ALLOWED_ORIGINS,

    // Logging
    logLevel: process.env.LOG_LEVEL,
    mcpLogLevel: process.env.MCP_LOG_LEVEL,

    // OpenTelemetry
    otelEnabled: process.env.OTEL_ENABLED === "true",
    otelServiceName: process.env.OTEL_SERVICE_NAME,
    otelExporterOtlpTracesEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    otelExporterOtlpMetricsEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,

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

  try {
    const parsedConfig = ConfigSchema.parse(rawConfig);
    return parsedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Configuration validation failed:");
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      throw new Error("Invalid configuration");
    }
    throw error;
  }
}

export const mcpConfig = parseConfig();

export const appConfig: AppConfig = mcpConfig;
