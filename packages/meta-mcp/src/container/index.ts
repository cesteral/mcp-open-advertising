import "reflect-metadata"; // MUST be first import
import type { Logger } from "pino";
import { registerCoreServices } from "./registrations/core.js";
import { registerMcpServices } from "./registrations/mcp.js";

let isContainerComposed = false;

export function composeContainer(logger?: Logger): void {
  if (isContainerComposed) {
    return;
  }

  registerCoreServices(logger);
  registerMcpServices();

  isContainerComposed = true;
}

export * as Tokens from "./tokens.js";
