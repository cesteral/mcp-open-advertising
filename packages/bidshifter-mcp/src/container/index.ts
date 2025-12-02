/**
 * Dependency Injection Container Setup
 */

import "reflect-metadata";
import { container } from "tsyringe";
import type { Logger } from "pino";
import { registerCoreServices } from "./registrations/core.js";

export * from "./tokens.js";

/**
 * Setup and configure the DI container
 * @param logger Optional logger instance to use
 */
export function setupContainer(logger?: Logger): typeof container {
  registerCoreServices(logger);
  return container;
}

export { container };
