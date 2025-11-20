import { AsyncLocalStorage } from "async_hooks";
import { McpError, JsonRpcErrorCode } from "../errors/index.js";
import type { RequestContext } from "../internal/request-context.js";
import { appConfig } from "../../config/index.js";

/**
 * Authentication information stored in AsyncLocalStorage
 */
export interface AuthInfo {
  subject: string; // User/service account ID
  scopes: string[]; // Granted permissions
  clientId: string; // OAuth client ID
  tenantId?: string; // Multi-tenancy support
  token?: string; // Raw JWT (for forwarding to DV360 API if needed)
}

/**
 * Authentication store
 */
export interface AuthStore {
  authInfo: AuthInfo;
}

/**
 * AsyncLocalStorage for auth context propagation
 */
export const authContext = new AsyncLocalStorage<AuthStore>();

/**
 * Get current auth info from AsyncLocalStorage
 */
export function getAuthInfo(): AuthInfo | undefined {
  return authContext.getStore()?.authInfo;
}

/**
 * Check if user has required scopes
 */
export function withRequiredScopes(requiredScopes: string[]): void {
  // When auth is disabled (MCP_AUTH_MODE=none), allow all
  if (appConfig.mcpAuthMode === "none") {
    return;
  }

  // Get auth info from AsyncLocalStorage
  const store = authContext.getStore();
  if (!store?.authInfo) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "No authentication information found");
  }

  const userScopes = store.authInfo.scopes;
  const hasAllScopes = requiredScopes.every((scope) => userScopes.includes(scope));

  if (!hasAllScopes) {
    throw new McpError(JsonRpcErrorCode.Forbidden, "Insufficient permissions", {
      required: requiredScopes,
      provided: userScopes,
    });
  }
}

/**
 * Wrapper function to enforce authentication and authorization on tool logic
 * @param requiredScopes Array of required scopes for this tool
 * @param logicFn Tool logic function to wrap
 * @returns Wrapped function with auth checks
 */
export function withToolAuth<TInput, TOutput>(
  requiredScopes: string[],
  logicFn: (input: TInput, context: RequestContext, sdkContext?: any) => TOutput | Promise<TOutput>
): (input: TInput, context: RequestContext, sdkContext?: any) => Promise<TOutput> {
  return async (input, context, sdkContext) => {
    // Check required scopes (throws if unauthorized)
    withRequiredScopes(requiredScopes);

    // Execute original logic
    return Promise.resolve(logicFn(input, context, sdkContext));
  };
}

/**
 * Helper function to check if current user has any of the specified scopes
 */
export function hasAnyScope(scopes: string[]): boolean {
  if (appConfig.mcpAuthMode === "none") {
    return true;
  }

  const store = authContext.getStore();
  if (!store?.authInfo) {
    return false;
  }

  return scopes.some((scope) => store.authInfo.scopes.includes(scope));
}

/**
 * Helper function to check if current user has all of the specified scopes
 */
export function hasAllScopes(scopes: string[]): boolean {
  if (appConfig.mcpAuthMode === "none") {
    return true;
  }

  const store = authContext.getStore();
  if (!store?.authInfo) {
    return false;
  }

  return scopes.every((scope) => store.authInfo.scopes.includes(scope));
}

/**
 * Get tenant ID from auth context (for multi-tenancy support)
 */
export function getTenantId(): string | undefined {
  return authContext.getStore()?.authInfo.tenantId;
}

/**
 * Get subject (user/service account ID) from auth context
 */
export function getSubject(): string | undefined {
  return authContext.getStore()?.authInfo.subject;
}
