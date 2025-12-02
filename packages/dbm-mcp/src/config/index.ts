import { config } from "dotenv";
import { z } from "zod";
import { existsSync } from "fs";
import { resolve } from "path";

// Suppress dotenv banner by temporarily redirecting stdout
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: any, ...args: any[]): boolean => {
  // Suppress dotenv banner messages
  if (typeof chunk === "string" && chunk.includes("[dotenv@")) {
    return true;
  }
  return originalWrite(chunk, ...args);
};

// Load .env file from package root
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const result = config({ path: envPath });
  // Debug: Log to stderr if .env loaded successfully
  if (result.parsed) {
    process.stderr.write(
      `[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`
    );
  }
} else {
  process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
}

// Restore stdout.write
process.stdout.write = originalWrite;

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

  // Authentication (MCP clients)
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
  otelServiceName: z.string().default("dbm-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),

  // Google Cloud / Bid Manager API Configuration
  gcpProjectId: z.string().optional(),
  serviceAccountJson: z.string().optional(), // Base64 encoded service account JSON
  serviceAccountFile: z.string().optional(), // Path to service account JSON file

  // Rate Limiting
  rateLimitPerMinute: z.number().default(100), // Bid Manager API is less restrictive

  // Report Settings (Bid Manager async reports)
  reportPollIntervalMs: z.number().default(2000), // Poll every 2 seconds
  reportPollTimeoutMs: z.number().default(120000), // 2 minutes max wait
  reportCacheTtlMs: z.number().default(300000), // 5 minute cache

  // BigQuery Configuration (for report storage)
  bigQueryDataset: z.string().default("bidshifter"),
  bigQueryLocation: z.string().default("US"),

  // GCS Configuration (for report downloads)
  gcsBucket: z.string().optional(),

  // Google Cloud (for Secret Manager)
  serviceAccountSecretId: z.string().optional(), // GCP Secret Manager secret ID
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration from environment variables
 */
export function parseConfig(): AppConfig {
  const rawConfig = {
    serviceName: process.env.SERVICE_NAME,
    port: process.env.DBM_MCP_PORT ? Number(process.env.DBM_MCP_PORT) : undefined,
    host: process.env.DBM_MCP_HOST,
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

    // Google Cloud / Bid Manager API
    gcpProjectId: process.env.GCP_PROJECT_ID,
    serviceAccountJson: process.env.SERVICE_ACCOUNT_JSON,
    serviceAccountFile: process.env.SERVICE_ACCOUNT_FILE,

    // Rate Limiting
    rateLimitPerMinute: process.env.RATE_LIMIT_PER_MINUTE
      ? Number(process.env.RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Report Settings
    reportPollIntervalMs: process.env.REPORT_POLL_INTERVAL_MS
      ? Number(process.env.REPORT_POLL_INTERVAL_MS)
      : undefined,
    reportPollTimeoutMs: process.env.REPORT_POLL_TIMEOUT_MS
      ? Number(process.env.REPORT_POLL_TIMEOUT_MS)
      : undefined,
    reportCacheTtlMs: process.env.REPORT_CACHE_TTL_MS
      ? Number(process.env.REPORT_CACHE_TTL_MS)
      : undefined,

    // BigQuery
    bigQueryDataset: process.env.BIGQUERY_DATASET_ID,
    bigQueryLocation: process.env.BIGQUERY_LOCATION,

    // GCS
    gcsBucket: process.env.GCS_BUCKET_NAME,

    // Google Cloud
    serviceAccountSecretId: process.env.SERVICE_ACCOUNT_SECRET_ID,
  };

  try {
    const config = ConfigSchema.parse(rawConfig);

    // Debug: Log service account status to stderr
    process.stderr.write(
      `[config] SERVICE_ACCOUNT_JSON present: ${!!config.serviceAccountJson}, length: ${config.serviceAccountJson?.length || 0}\n`
    );

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

    // Validation: Bid Manager service account required for production
    if (
      config.nodeEnv === "production" &&
      !config.serviceAccountJson &&
      !config.serviceAccountFile &&
      !config.serviceAccountSecretId
    ) {
      throw new Error(
        "Production requires either SERVICE_ACCOUNT_JSON, SERVICE_ACCOUNT_FILE, or SERVICE_ACCOUNT_SECRET_ID"
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

/**
 * Legacy exports for backward compatibility
 */
export const gcpConfig = {
  projectId: mcpConfig.gcpProjectId || "",
  region: process.env.GCP_REGION || "us-central1",
  bigQueryDataset: mcpConfig.bigQueryDataset,
  bigQueryLocation: mcpConfig.bigQueryLocation,
  gcsBucket: mcpConfig.gcsBucket || "",
};
