/**
 * Register MCP-specific services (Tools, Resources, etc.)
 */
export function registerMcpServices(): void {
  // Tool definitions are registered directly in server.ts using the MCP SDK's
  // `server.tool()` API. Each tool file resolves its own service dependencies
  // from the container at call time.
}
