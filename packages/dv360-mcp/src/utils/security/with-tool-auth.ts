import { AsyncLocalStorage } from "async_hooks";
import type { RequestContext } from "../internal/request-context.js";

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
export function withRequiredScopes(_requiredScopes: string[]): void {
  // Auth is now handled at the transport level (credentials in headers).
  // Scope-based authorization is not currently enforced.
  return;
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
export function hasAnyScope(_scopes: string[]): boolean {
  // Auth is now handled at the transport level (credentials in headers).
  return true;
}

/**
 * Helper function to check if current user has all of the specified scopes
 */
export function hasAllScopes(_scopes: string[]): boolean {
  // Auth is now handled at the transport level (credentials in headers).
  return true;
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
