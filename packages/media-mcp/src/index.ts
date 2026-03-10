import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { SupabaseAuthAdapter } from "./auth/supabase-auth-adapter.js";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
} from "@cesteral/shared";
import {
  createSessionServices,
  sessionServiceStore,
} from "./services/session-services.js";
import { rateLimiter } from "./utils/security/rate-limiter.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("media-mcp", transportMode, otelLogMixin());

/**
 * Set up credentials for stdio mode from environment variables.
 * Creates a SupabaseAuthAdapter and session services for the "stdio" session.
 */
async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const supabaseUrl = mcpConfig.supabaseUrl;
  const serviceRoleKey = mcpConfig.supabaseServiceRoleKey;

  if (!supabaseUrl || !serviceRoleKey) {
    logger.warn(
      "No Supabase credentials found in env vars. " +
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for stdio mode."
    );
    return false;
  }

  const authAdapter = new SupabaseAuthAdapter(supabaseUrl, serviceRoleKey);
  await authAdapter.validate();

  const services = createSessionServices(authAdapter, logger, rateLimiter);
  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "media-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});
