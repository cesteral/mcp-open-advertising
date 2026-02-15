/**
 * Base Configuration Schema & Helpers
 *
 * Common config fields and env-loading logic shared by all MCP servers.
 * Each server extends BaseConfigSchema with platform-specific fields.
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { z } from "zod";

/**
 * Load .env file from CWD with stderr logging.
 */
export function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const result = config({ path: envPath, debug: false });
    if (result.parsed) {
      process.stderr.write(
        `[config] Loaded .env from ${envPath} with ${Object.keys(result.parsed).length} variables\n`
      );
    }
  } else {
    process.stderr.write(`[config] WARNING: .env file not found at ${envPath}\n`);
  }
}

/**
 * Base config schema shared by all MCP servers.
 * Each server extends this with platform-specific fields and overrides
 * mcpAuthMode with its own enum.
 */
export const BaseConfigSchema = z.object({
  // Service Identity
  serviceName: z.string(),
  port: z.number().int().min(1).max(65535),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Session Management
  mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),
  mcpStatefulSessionTimeoutMs: z.number().default(3600000), // 1 hour

  // Auth (servers refine mcpAuthMode with their own enum)
  mcpAuthMode: z.string(),
  mcpAuthSecretKey: z.string().optional(),

  // CORS Configuration
  mcpAllowedOrigins: z.string().optional(),

  // Logging
  logLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("info"),
  mcpLogLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("debug"),

  // OpenTelemetry
  otelEnabled: z.boolean().default(false),
  otelServiceName: z.string(),
  otelExporterOtlpTracesEndpoint: z.string().url().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().url().optional(),
});

/**
 * Read base environment variables common to all servers.
 * Returns a partial config object to be merged with server-specific vars.
 */
export function getBaseEnvConfig(defaultHost: string): Record<string, unknown> {
  return {
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

    // Host
    host: defaultHost,
  };
}

/**
 * Parse config with a Zod schema and friendly error logging.
 */
export function parseConfigWithSchema<T extends z.ZodTypeAny>(schema: T, raw: Record<string, unknown>): z.infer<T> {
  try {
    return schema.parse(raw);
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
 * Compute default host based on NODE_ENV.
 * MCP Spec 2025-11-25: bind to localhost in development to prevent
 * DNS rebinding attacks; use 0.0.0.0 in production for Cloud Run.
 */
export function getDefaultHost(): string {
  return process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
}
