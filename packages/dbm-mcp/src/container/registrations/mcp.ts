// import { container } from "tsyringe";
// import * as Tokens from "../tokens.js";
// ↑ Uncomment when registering DI services below (e.g. ResourceRegistry)

/**
 * Register MCP-specific services (Tools, Resources, etc.)
 */
export function registerMcpServices(): void {
  // Resource Registry — not yet implemented for dbm-mcp.
  // When a ResourceRegistry class is created (similar to dv360-mcp), register it here:
  //   import { ResourceRegistry } from "../../mcp-server/resources/utils/resource-registry.js";
  //   container.registerSingleton(Tokens.ResourceRegistry, ResourceRegistry);

  // Tool Definitions
  // ----------------
  // Tool definitions are registered directly in server.ts using the MCP SDK's
  // `server.tool()` API, which doesn't fit the multi-injection DI pattern well.
  // Each tool file (e.g., get-campaign-delivery.tool.ts) resolves its own service
  // dependencies from the container at call time, so there is no need to
  // register tool definitions here.
}
