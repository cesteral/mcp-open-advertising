/**
 * MCP-specific types
 */

import type { z } from "zod";
import type { RequestContext } from "@cesteral/shared";
import type { ElicitRequestFormParams, ElicitRequestURLParams, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolInputExample } from "@cesteral/shared";

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
 */
export interface SdkContext {
  requestId?: string;
  sessionId?: string;
  elicitInput?: (params: ElicitRequestFormParams | ElicitRequestURLParams) => Promise<ElicitResult>;
  [key: string]: unknown;
}
