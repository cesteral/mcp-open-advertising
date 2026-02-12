import { container } from "tsyringe";
import * as Tokens from "../tokens.js";
import { ResourceRegistry } from "../../mcp-server/resources/utils/resource-registry.js";

/**
 * Register MCP-specific services (Tools, Resources, etc.)
 */
export function registerMcpServices(): void {
  // Resource Registry (singleton) — manages MCP resource definitions and URI matching
  container.registerSingleton(Tokens.ResourceRegistry, ResourceRegistry);

  // Tool Definitions
  // ----------------
  // Tool definitions are registered directly in server.ts using the MCP SDK's
  // `server.tool()` API, which doesn't fit the multi-injection DI pattern well.
  // Each tool file (e.g., list-entities.tool.ts) resolves its own service
  // dependencies from the container at call time, so there is no need to
  // register tool definitions here.
}
