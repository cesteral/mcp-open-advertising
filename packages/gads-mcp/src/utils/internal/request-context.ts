import { randomUUID } from "crypto";

export interface RequestContext {
  requestId: string;
  timestamp: string;
  tenantId?: string;
  traceId?: string;
  spanId?: string;
  operation?: string;
  [key: string]: unknown;
}

export function generateRequestContextId(): string {
  return `req-${randomUUID()}`;
}

export function createRequestContext(params?: {
  parentContext?: Record<string, unknown>;
  additionalContext?: Record<string, unknown>;
  operation?: string;
}): RequestContext {
  const requestId =
    (params?.parentContext?.requestId as string) ?? generateRequestContextId();

  return {
    requestId,
    timestamp: new Date().toISOString(),
    ...params?.parentContext,
    ...params?.additionalContext,
    operation: params?.operation,
  };
}

export const requestContextService = {
  createRequestContext,
  generateRequestContextId,
};
