/**
 * Dependency Injection Tokens
 * Symbol-based tokens for type-safe DI with tsyringe
 */

// Core Services
export const AppConfig = Symbol("AppConfig");
export const Logger = Symbol("Logger");

// Optimization Services
export const PacingService = Symbol("PacingService");

// BigQuery Services for feedback storage
export const BigQueryConfig = Symbol("BigQueryConfig");
export const BigQueryService = Symbol("BigQueryService");
export const FeedbackRepository = Symbol("FeedbackRepository");
