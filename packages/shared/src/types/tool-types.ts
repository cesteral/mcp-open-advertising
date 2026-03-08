/**
 * Canonical MCP tool/resource/context types — single source of truth across all servers.
 *
 * Uses structural types (no @modelcontextprotocol/sdk import) so this file
 * compiles cleanly in the shared package without adding the SDK as a dependency.
 */

import type { z } from "zod";
import type { RequestContext } from "../utils/request-context.js";
import type { ToolInputExample } from "../utils/tool-handler-factory.js";

/**
 * Structural subset of ElicitResult from the MCP SDK.
 * Matches the shape used by all servers that call elicitInput().
 */
export interface ElicitResultLike {
  action: string;
  content?: Record<string, unknown>;
}

/**
 * SDK context passed to tool logic functions.
 */
export interface SdkContext {
  requestId?: string;
  sessionId?: string;
  elicitInput?: (params: Record<string, unknown>) => Promise<ElicitResultLike>;
  [key: string]: unknown;
}

/**
 * Tool definition structure used by all MCP servers.
 */
export interface ToolDefinition<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;
  title: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  inputExamples?: ToolInputExample[];
  logic: (
    input: z.infer<TInputSchema>,
    context: RequestContext,
    sdkContext?: SdkContext
  ) => Promise<z.infer<TOutputSchema>>;
  responseFormatter?: (result: z.infer<TOutputSchema>, input: z.infer<TInputSchema>) => any;
}

/**
 * Resource definition structure used by servers that expose MCP Resources.
 */
export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  read: (params: Record<string, unknown>) => Promise<{
    contents: Array<{
      uri: string;
      mimeType: string;
      text: string;
    }>;
  }>;
}
