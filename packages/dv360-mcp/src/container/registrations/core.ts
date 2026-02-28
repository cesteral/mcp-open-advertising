import { container } from "tsyringe";
import type { Logger } from "pino";
import { createLogger } from "@cesteral/shared";
import { appConfig } from "../../config/index.js";
import * as Tokens from "../tokens.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";
import { requestContextService } from "@cesteral/shared";

/**
 * Register core services (Config, Logger, etc.)
 * These are foundational services needed by all other components.
 *
 * Note: DV360HttpClient, DV360Service, and TargetingService are no longer
 * registered as singletons here. They are created per-session via
 * SessionServiceStore (see services/session-services.ts).
 *
 * @param logger Optional logger instance to use (for stdio mode with stderr logging)
 */
export function registerCoreServices(logger?: Logger): void {
  // Configuration (static value)
  container.register(Tokens.AppConfig, { useValue: appConfig });

  // Logger (use provided logger or create default)
  // In stdio mode, the logger is configured to write to stderr
  const loggerInstance = logger || createLogger("dv360-mcp");
  container.register(Tokens.Logger, { useValue: loggerInstance });

  // Request Context Service (static instance)
  container.register(Tokens.RequestContextService, { useValue: requestContextService });

  // Rate Limiter Service (singleton instance)
  container.register(Tokens.RateLimiterService, { useValue: rateLimiter });
}
