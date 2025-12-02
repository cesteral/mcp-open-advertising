import { container } from "tsyringe";
import type { Logger } from "pino";
import { createLogger } from "@bidshifter/shared";
import { appConfig } from "../../config/index.js";
import * as Tokens from "../tokens.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";
import { requestContextService } from "../../utils/internal/request-context.js";
import { DeliveryService, EntityService } from "@bidshifter/platform-lib";
import { BidManagerService } from "../../services/bid-manager/index.js";

/**
 * Register core services (Config, Logger, etc.)
 * These are foundational services needed by all other components
 * @param logger Optional logger instance to use (for stdio mode with stderr logging)
 */
export function registerCoreServices(logger?: Logger): void {
  // Configuration (static value)
  container.register(Tokens.AppConfig, { useValue: appConfig });

  // Logger (use provided logger or create default)
  // In stdio mode, the logger is configured to write to stderr
  const loggerInstance = logger || createLogger("dbm-mcp");
  container.register(Tokens.Logger, { useValue: loggerInstance });

  // Request Context Service (static instance)
  container.register(Tokens.RequestContextService, { useValue: requestContextService });

  // Rate Limiter Service (singleton instance)
  container.register(Tokens.RateLimiterService, { useValue: rateLimiter });

  // Bid Manager Service (singleton for API interactions)
  container.registerSingleton(Tokens.BidManagerService, BidManagerService);

  // Platform services (from @bidshifter/platform-lib)
  // These provide stub implementations for now
  container.register(DeliveryService, { useClass: DeliveryService });
  container.register(EntityService, { useClass: EntityService });
}
