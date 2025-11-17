import { config } from "dotenv";
import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";

// Suppress dotenv banner by temporarily redirecting stdout
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: any, ...args: any[]): boolean => {
  // Suppress dotenv banner messages
  if (typeof chunk === 'string' && chunk.includes('[dotenv@')) {
    return true;
  }
  return originalWrite(chunk, ...args);
};

// Load .env file from package root
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const result = config({ path: envPath });
  // Debug: Log to stderr if .env loaded successfully
  if (result.parsed) {
    process.stderr.write(`[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`);
  }
} else {
  process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
}

// Restore stdout.write
process.stdout.write = originalWrite;

/**
 * Configuration schema with Zod validation
 * Based on Phase 2 architecture requirements
 */
const ConfigSchema = z.object({
  // Service Identity
  serviceName: z.string().default("dv360-mcp"),
  port: z.number().int().min(1).max(65535).default(3002),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Authentication
  mcpAuthMode: z.enum(["none", "jwt", "oauth"]).default("none"),
  mcpAuthSecretKey: z.string().min(32).optional(),
  jwtSecret: z.string().default("dev-secret-change-in-production"), // Legacy, kept for compatibility

  // Session Management
  mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),
  mcpStatefulSessionTimeoutMs: z.number().default(3600000), // 1 hour

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
  dv360ServiceAccountJson: z.string().optional(), // Base64 encoded service account JSON
  dv360ServiceAccountFile: z.string().optional(), // Path to service account JSON file
  dv360RateLimitPerMinute: z.number().default(60),

  // Google Cloud Configuration (for Secret Manager)
  serviceAccountSecretId: z.string().optional(), // GCP Secret Manager secret ID
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration from environment variables
 */
export function parseConfig(): AppConfig {
  const rawConfig = {
    serviceName: process.env.SERVICE_NAME,
    port: process.env.DV360_MCP_PORT ? Number(process.env.DV360_MCP_PORT) : undefined,
    host: process.env.DV360_MCP_HOST,
    nodeEnv: process.env.NODE_ENV,

    // Authentication
    mcpAuthMode: process.env.MCP_AUTH_MODE,
    mcpAuthSecretKey: process.env.MCP_AUTH_SECRET_KEY,
    jwtSecret: process.env.JWT_SECRET,

    // Session
    mcpSessionMode: process.env.MCP_SESSION_MODE,
    mcpStatefulSessionTimeoutMs: process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS
      ? Number(process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS)
      : undefined,

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
    dv360ServiceAccountJson: process.env.DV360_SERVICE_ACCOUNT_JSON,
    dv360ServiceAccountFile: process.env.DV360_SERVICE_ACCOUNT_FILE,
    dv360RateLimitPerMinute: process.env.DV360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.DV360_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Google Cloud
    serviceAccountSecretId: process.env.SERVICE_ACCOUNT_SECRET_ID,
  };

  try {
    const config = ConfigSchema.parse(rawConfig);

    // Debug: Log service account status to stderr
    process.stderr.write(`[config] DV360_SERVICE_ACCOUNT_JSON present: ${!!config.dv360ServiceAccountJson}, length: ${config.dv360ServiceAccountJson?.length || 0}\n`);

    // Validation: JWT mode requires secret key
    if (config.mcpAuthMode === "jwt" && !config.mcpAuthSecretKey) {
      throw new Error("MCP_AUTH_SECRET_KEY is required when MCP_AUTH_MODE=jwt");
    }

    // Validation: Production requires auth
    if (config.nodeEnv === "production" && config.mcpAuthMode === "none") {
      console.warn(
        "WARNING: Running in production mode without authentication (MCP_AUTH_MODE=none)"
      );
    }

    // Validation: DV360 service account required for production
    if (
      config.nodeEnv === "production" &&
      !config.dv360ServiceAccountJson &&
      !config.dv360ServiceAccountFile &&
      !config.serviceAccountSecretId
    ) {
      throw new Error(
        "Production requires either DV360_SERVICE_ACCOUNT_JSON, DV360_SERVICE_ACCOUNT_FILE, or SERVICE_ACCOUNT_SECRET_ID"
      );
    }

    return config;
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
