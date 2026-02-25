/**
 * Dependency Injection Tokens
 * Symbol-based tokens for type-safe DI with tsyringe
 */

// Core Services
export const AppConfig = Symbol("AppConfig");
export const Logger = Symbol("Logger");

// Infrastructure Services
export const RateLimiterService = Symbol("RateLimiterService");
export const RequestContextService = Symbol("RequestContextService");

// MCP Components
export const ResourceRegistry = Symbol("ResourceRegistry");
