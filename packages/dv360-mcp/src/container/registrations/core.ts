import { container } from "tsyringe";
import { createLogger } from "@bidshifter/shared";
import { appConfig } from "../../config/index.js";
import * as Tokens from "../tokens.js";
import { rateLimiter } from "../../utils/security/rateLimiter.js";
import { requestContextService } from "../../utils/internal/requestContext.js";
import { DV360Service } from "../../services/dv360/DV360Service.js";

/**
 * Register core services (Config, Logger, etc.)
 * These are foundational services needed by all other components
 */
export function registerCoreServices(): void {
  // Configuration (static value)
  container.register(Tokens.AppConfig, { useValue: appConfig });

  // Logger (static instance)
  const logger = createLogger("dv360-mcp");
  container.register(Tokens.Logger, { useValue: logger });

  // Request Context Service (static instance)
  container.register(Tokens.RequestContextService, { useValue: requestContextService });

  // Rate Limiter Service (singleton instance)
  container.register(Tokens.RateLimiterService, { useValue: rateLimiter });

  // DV360 Service (singleton class)
  container.registerSingleton(Tokens.DV360Service, DV360Service);
}
