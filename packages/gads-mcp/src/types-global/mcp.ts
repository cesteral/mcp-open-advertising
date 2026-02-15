/**
 * MCP-specific types
 */

import type { z } from "zod";
import type { RequestContext } from "../utils/internal/request-context.js";

/**
 * Tool definition structure
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
    openWorldHint?: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
  };
  logic: (
    input: z.infer<TInputSchema>,
    context: RequestContext,
    sdkContext?: SdkContext
  ) => Promise<z.infer<TOutputSchema>>;
  responseFormatter?: (result: z.infer<TOutputSchema>) => any;
}

/**
 * SDK Context from MCP SDK
 */
export interface SdkContext {
  requestId?: string;
  sessionId?: string;
  elicitInput?: (params: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}
