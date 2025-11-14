import "reflect-metadata"; // MUST be first import
import { registerCoreServices } from "./registrations/core.js";
import { registerMcpServices } from "./registrations/mcp.js";

let isContainerComposed = false;

/**
 * Compose the DI container
 * This function is idempotent - can be called multiple times safely
 */
export function composeContainer(): void {
  if (isContainerComposed) {
    return;
  }

  // Register services in dependency order
  registerCoreServices();
  registerMcpServices();

  isContainerComposed = true;
}

// Re-export tokens for convenience
export * as Tokens from "./tokens.js";
