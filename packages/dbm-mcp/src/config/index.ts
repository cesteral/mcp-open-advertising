import { config } from "dotenv";
import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";

// Load .env file from package root
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  // Debug: Log to stderr if .env loaded successfully
  if (result.parsed) {
    process.stderr.write(
      `[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`
    );
  }
} else {
  process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
}

/**
 * Configuration schema with Zod validation
 * Based on Phase 2 architecture requirements for Bid Manager API
 */
const ConfigSchema = z.object({
  // Service Identity
  serviceName: z.string().default("dbm-mcp"),
  port: z.number().int().min(1).max(65535).default(3001),
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
  otelServiceName: z.string().default("dbm-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),

  // Google Cloud
  gcpProjectId: z.string().optional(),

  // Stdio-mode fallback credentials (env vars only, not used in HTTP mode)
  serviceAccountJson: z.string().optional(), // Base64 encoded service account JSON
  serviceAccountFile: z.string().optional(), // Path to service account JSON file

  // Rate Limiting
  rateLimitPerMinute: z.number().default(100), // Bid Manager API is less restrictive

  // Report Settings (Bid Manager async reports with exponential backoff)
  reportCacheTtlMs: z.number().default(300000), // 5 minute cache
  reportPollMaxRetries: z.number().default(10), // Max polling attempts
  reportPollInitialDelayMs: z.number().default(2000), // Initial backoff delay (2s)
  reportPollMaxDelayMs: z.number().default(60000), // Max backoff delay (60s)
  reportQueryRetries: z.number().default(3), // High-level query retries
  reportRetryCooldownMs: z.number().default(60000), // Delay before retry (60s)
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
    port: process.env.DBM_MCP_PORT ? Number(process.env.DBM_MCP_PORT) : undefined,
    host: process.env.DBM_MCP_HOST || defaultHost,
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

    // Google Cloud
    gcpProjectId: process.env.GCP_PROJECT_ID,

    // Stdio-mode fallback credentials
    serviceAccountJson: process.env.SERVICE_ACCOUNT_JSON,
    serviceAccountFile: process.env.SERVICE_ACCOUNT_FILE,

    // Rate Limiting
    rateLimitPerMinute: process.env.RATE_LIMIT_PER_MINUTE
      ? Number(process.env.RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Report Settings
    reportCacheTtlMs: process.env.REPORT_CACHE_TTL_MS
      ? Number(process.env.REPORT_CACHE_TTL_MS)
      : undefined,
    reportPollMaxRetries: process.env.REPORT_POLL_MAX_RETRIES
      ? Number(process.env.REPORT_POLL_MAX_RETRIES)
      : undefined,
    reportPollInitialDelayMs: process.env.REPORT_POLL_INITIAL_DELAY_MS
      ? Number(process.env.REPORT_POLL_INITIAL_DELAY_MS)
      : undefined,
    reportPollMaxDelayMs: process.env.REPORT_POLL_MAX_DELAY_MS
      ? Number(process.env.REPORT_POLL_MAX_DELAY_MS)
      : undefined,
    reportQueryRetries: process.env.REPORT_QUERY_RETRIES
      ? Number(process.env.REPORT_QUERY_RETRIES)
      : undefined,
    reportRetryCooldownMs: process.env.REPORT_RETRY_COOLDOWN_MS
      ? Number(process.env.REPORT_RETRY_COOLDOWN_MS)
      : undefined,
  };

  try {
    const config = ConfigSchema.parse(rawConfig);
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

/**
 * Legacy exports for backward compatibility
 */
export const gcpConfig = {
  projectId: mcpConfig.gcpProjectId || "",
  region: process.env.GCP_REGION || "us-central1",
};
