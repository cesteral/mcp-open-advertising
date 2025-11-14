/**
 * MCP-specific types
 */

import type { z } from "zod";
import type { RequestContext } from "../utils/internal/requestContext.js";

/**
 * Tool definition structure
 */
export interface ToolDefinition<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny
> {
  name: string;
  title: string;
  description: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    idempotentHint?: boolean;
  };
  logic: (
    input: z.infer<TInputSchema>,
    context: RequestContext
  ) => Promise<z.infer<TOutputSchema>>;
  responseFormatter?: (result: z.infer<TOutputSchema>) => any;
}

/**
 * Resource definition structure
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

/**
 * SDK Context from MCP SDK
 * (This is a simplified version - actual SDK provides more fields)
 */
export interface SdkContext {
  requestId?: string;
  [key: string]: unknown;
}
