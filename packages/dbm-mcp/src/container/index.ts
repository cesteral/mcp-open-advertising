import "reflect-metadata"; // MUST be first import
import type { Logger } from "pino";
import { registerCoreServices } from "./registrations/core.js";
import { registerMcpServices } from "./registrations/mcp.js";

let isContainerComposed = false;

/**
 * Compose the DI container
 * This function is idempotent - can be called multiple times safely
 * @param logger Optional logger instance to use (for stdio mode with stderr logging)
 */
export function composeContainer(logger?: Logger): void {
  if (isContainerComposed) {
    return;
  }

  // Register services in dependency order
  registerCoreServices(logger);
  registerMcpServices();

  isContainerComposed = true;
}

// Re-export tokens for convenience
export * as Tokens from "./tokens.js";
