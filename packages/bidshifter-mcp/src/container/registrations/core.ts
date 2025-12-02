/**
 * Core service registrations for bidshifter-mcp
 */

import { container } from "tsyringe";
import type { Logger } from "pino";
import { createLogger } from "@bidshifter/shared";
import { mcpConfig, bigQueryConfig } from "../../config/index.js";
import * as Tokens from "../tokens.js";
import { PacingService } from "../../services/pacing/index.js";
import { BigQueryService, FeedbackRepository } from "../../services/bigquery/index.js";

/**
 * Register core services (Config, Logger, etc.)
 * These are foundational services needed by all other components
 * @param logger Optional logger instance to use
 */
export function registerCoreServices(logger?: Logger): void {
  // Configuration (static value)
  container.register(Tokens.AppConfig, { useValue: mcpConfig });

  // Logger (use provided logger or create default)
  const loggerInstance = logger || createLogger("bidshifter-mcp");
  container.register(Tokens.Logger, { useValue: loggerInstance });

  // BigQuery Configuration
  container.register(Tokens.BigQueryConfig, { useValue: bigQueryConfig });

  // BigQuery Service (singleton for database interactions)
  container.registerSingleton(Tokens.BigQueryService, BigQueryService);

  // Feedback Repository (singleton for feedback storage)
  container.registerSingleton(Tokens.FeedbackRepository, FeedbackRepository);

  // Pacing Service (singleton for optimization calculations)
  container.registerSingleton(Tokens.PacingService, PacingService);
}
