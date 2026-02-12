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
export const ToolRegistry = Symbol("ToolRegistry");
export const ResourceRegistry = Symbol("ResourceRegistry");
export const ToolDefinitions = Symbol("ToolDefinitions");
export const ResourceDefinitions = Symbol("ResourceDefinitions");
export const CreateMcpServerInstance = Symbol("CreateMcpServerInstance");
