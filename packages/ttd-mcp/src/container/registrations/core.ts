import { container } from "tsyringe";
import type { Logger } from "pino";
import { createLogger } from "@bidshifter/shared";
import { appConfig } from "../../config/index.js";
import * as Tokens from "../tokens.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";
import { requestContextService } from "../../utils/internal/request-context.js";

export function registerCoreServices(logger?: Logger): void {
  container.register(Tokens.AppConfig, { useValue: appConfig });

  const loggerInstance = logger || createLogger("ttd-mcp");
  container.register(Tokens.Logger, { useValue: loggerInstance });

  container.register(Tokens.RequestContextService, { useValue: requestContextService });

  container.register(Tokens.RateLimiterService, { useValue: rateLimiter });
}
