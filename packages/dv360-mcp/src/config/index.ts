import { config } from "dotenv";
import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";

// Load .env file from package root
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  // Debug: Log to stderr if .env loaded successfully
  if (result.parsed) {
    process.stderr.write(`[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`);
  }
} else {
  process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
}

/**
 * Configuration schema with Zod validation
 *
 * Note: Google API credentials are now provided by the end-user via HTTP
 * headers at connection time (see streamable-http-transport.ts). The server no
 * longer owns a service account.
 */
const ConfigSchema = z.object({
  // Service Identity
  serviceName: z.string().default("dv360-mcp"),
  port: z.number().int().min(1).max(65535).default(3002),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Session Management
  mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),
  mcpStatefulSessionTimeoutMs: z.number().default(3600000), // 1 hour

  // Auth
  mcpAuthMode: z.enum(["google-headers", "jwt", "none"]).default("google-headers"),
  mcpAuthSecretKey: z.string().optional(),

  // CORS Configuration
  mcpAllowedOrigins: z.string().optional(),

  // Logging
  logLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("info"),
  mcpLogLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("debug"),

  // OpenTelemetry
  otelEnabled: z.boolean().default(false),
  otelServiceName: z.string().default("dv360-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),

  // DV360 API Configuration
  dv360ApiBaseUrl: z
    .string()
    .url()
    .default("https://displayvideo.googleapis.com/v4"),
  dv360RateLimitPerMinute: z.number().default(60),

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
  // MCP Spec 2025-11-25: bind to localhost in development to prevent
  // DNS rebinding attacks; use 0.0.0.0 in production for Cloud Run.
  const defaultHost = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

  const rawConfig = {
    serviceName: process.env.SERVICE_NAME,
    port: process.env.DV360_MCP_PORT ? Number(process.env.DV360_MCP_PORT) : undefined,
    host: process.env.DV360_MCP_HOST || defaultHost,
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

    // DV360 API
    dv360ApiBaseUrl: process.env.DV360_API_BASE_URL,
    dv360RateLimitPerMinute: process.env.DV360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.DV360_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    dv360ServiceAccountJson: process.env.DV360_SERVICE_ACCOUNT_JSON,
    dv360ServiceAccountFile: process.env.DV360_SERVICE_ACCOUNT_FILE,
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

/**
 * Global configuration instance
 * Exported for backward compatibility with existing code
 */
export const mcpConfig = parseConfig();

/**
 * Type-safe configuration access
 */
export const appConfig: AppConfig = mcpConfig;
