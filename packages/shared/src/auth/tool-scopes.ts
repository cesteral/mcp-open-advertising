// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * OAuth scopes for `/mcp` and the rule that enforces them (#246).
 *
 * Two scopes, deliberately coarse:
 *
 * - `mcp:read`  — call any tool annotated `readOnlyHint: true`.
 * - `mcp:write` — call every other tool (any tool that can change platform
 *   state: governed writes, uploads, report-schedule CRUD, ...). It implies
 *   `mcp:read`, so a write-scoped token needs no second scope.
 *
 * Enforcement is a transport decision (HTTP 403 `insufficient_scope`, so a client
 * can step up), not an in-band tool error. It applies only to a `jwt`-mode
 * token that carries a `scope` claim; see {@link scopeEnforcementApplies}.
 */

export const SCOPE_READ = "mcp:read";
export const SCOPE_WRITE = "mcp:write";

/** The scopes this fleet publishes as `scopes_supported`. */
export const SUPPORTED_SCOPES: readonly string[] = [SCOPE_READ, SCOPE_WRITE];

/** Scope a tool needs: write unless it is declared read-only (fail closed). */
export function requiredScopeForTool(annotations: { readOnlyHint?: boolean } | undefined): string {
  return annotations?.readOnlyHint === true ? SCOPE_READ : SCOPE_WRITE;
}

/**
 * Tool name → required scope, filled by `registerToolsFromDefinitions`. Tool
 * names carry a per-platform prefix, so one process-wide map is unambiguous.
 * The transport reads it after the session's MCP server exists, i.e. after its
 * tools have been registered.
 */
const toolScopes = new Map<string, string>();

export function registerToolScopes(
  tools: ReadonlyArray<{ name: string; annotations?: { readOnlyHint?: boolean } }>
): void {
  for (const tool of tools) {
    toolScopes.set(tool.name, requiredScopeForTool(tool.annotations));
  }
}

/** Required scope for a tool name; an unregistered name is treated as read. */
export function scopeRequiredForToolName(name: string): string {
  return toolScopes.get(name) ?? SCOPE_READ;
}

/**
 * Whether scope checks apply to this caller. The rule, in one place:
 *
 * - only a `jwt`-mode bearer token — the one credential whose `scope` claim
 *   this server issues or interprets. Platform bearer / header modes and
 *   `none` carry no scopes of ours (`google-headers` fills `authInfo.scopes`
 *   with Google API scopes, which mean nothing here);
 * - and only when the token carries a non-empty `scope` claim. A token with no
 *   `scope` is an unrestricted pre-shared token (full access, as before); it
 *   cannot be stepped up because it was never narrowed.
 */
export function scopeEnforcementApplies(authInfo: {
  authType: string;
  scopes?: string[];
}): boolean {
  return authInfo.authType === "jwt" && (authInfo.scopes?.length ?? 0) > 0;
}

/** True when `granted` satisfies `required` (`mcp:write` implies `mcp:read`). */
export function scopeSatisfies(granted: readonly string[], required: string): boolean {
  if (granted.includes(required)) return true;
  return required === SCOPE_READ && granted.includes(SCOPE_WRITE);
}
