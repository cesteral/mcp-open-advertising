// import { container } from "tsyringe";
// import * as Tokens from "../tokens.js";

/**
 * Register MCP-specific services (Tools, Resources, etc.)
 * This will be populated as we implement tools and resources
 */
export function registerMcpServices(): void {
  // Tool Registry (singleton)
  // Will be uncommented when ToolRegistry class is implemented
  // container.registerSingleton(Tokens.ToolRegistry, ToolRegistry);

  // Resource Registry (singleton)
  // Will be uncommented when ResourceRegistry class is implemented
  // container.registerSingleton(Tokens.ResourceRegistry, ResourceRegistry);

  // Tool Definitions (multi-injection pattern)
  // All tool definitions will be registered here
  // const allTools = [
  //   listEntitiesTool,
  //   getEntityTool,
  //   createEntityTool,
  //   updateEntityTool,
  //   deleteEntityTool,
  //   adjustLineItemBidsTool,
  //   bulkUpdateStatusTool,
  //   campaignSetupWizardTool,
  // ];
  //
  // for (const tool of allTools) {
  //   container.register(Tokens.ToolDefinitions, { useValue: tool });
  // }

  // Factory for MCP server instances
  // Will be uncommented when createMcpServerInstance is implemented
  // container.register(Tokens.CreateMcpServerInstance, {
  //   useValue: createMcpServerInstance,
  // });
}
