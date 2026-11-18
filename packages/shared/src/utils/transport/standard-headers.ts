// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * 2026-07-28 standard headers (SEP-2243), read before any work is done for a
 * modern-era POST (#248).
 *
 * `Mcp-Method` and `Mcp-Name` mirror the body's `method` and `params.name` /
 * `params.uri` so a gateway can route without parsing the body. The SDK's
 * `createMcpHandler` validates them in full (presence, Base64 sentinels,
 * cross-check), but only after this transport has authenticated, built the
 * caller's upstream client and created a server. A request whose headers
 * contradict its body is cheaper to refuse first, so this is a pre-check:
 *
 * - It rejects only an unambiguous contradiction, a present header whose
 *   (plain) value differs from the body. Missing headers, Base64-sentinel
 *   values and batches are left to the SDK, which owns those rules; this
 *   module never answers *less* strictly than the SDK, only earlier.
 * - It runs after authentication, so an unauthenticated caller still learns
 *   nothing (not even a header error).
 */

/** JSON-RPC code for a header/body disagreement (2026-07-28 `HeaderMismatch`). */
export const HEADER_MISMATCH_CODE = -32020;

/** Methods whose `Mcp-Name` mirrors a body param, and which param. */
const MCP_NAME_SOURCE: Record<string, string> = {
  "tools/call": "name",
  "prompts/get": "name",
  "resources/read": "uri",
};

/** What a modern POST declares, for routing and logs. Bounded and credential-free. */
export interface StandardHeaderView {
  method?: string;
  name?: string;
}

export interface StandardHeaderMismatch {
  header: "Mcp-Method" | "Mcp-Name";
  message: string;
  data: { header: string; headerValue: string; bodyValue: string };
}

/** `=?base64?…?=` marks an encoded value; the SDK decodes those, we do not. */
const isSentinel = (v: string): boolean => v.startsWith("=?");

/** Cap what reaches a log line: a header is caller-controlled. */
const clip = (v: string): string => (v.length > 200 ? `${v.slice(0, 200)}…` : v);

/**
 * Compare the standard headers with a parsed JSON-RPC body. Returns the first
 * contradiction, or `undefined` when there is none (or nothing to compare).
 */
export function findStandardHeaderMismatch(
  headers: { get(name: string): string | null },
  body: unknown
): StandardHeaderMismatch | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const { method, params } = body as { method?: unknown; params?: unknown };
  if (typeof method !== "string") return undefined;

  const methodHeader = headers.get("mcp-method");
  if (methodHeader !== null && !isSentinel(methodHeader) && methodHeader !== method) {
    return {
      header: "Mcp-Method",
      message: `Mcp-Method header "${clip(methodHeader)}" does not match the body method "${clip(method)}"`,
      data: { header: "Mcp-Method", headerValue: clip(methodHeader), bodyValue: clip(method) },
    };
  }

  const field = MCP_NAME_SOURCE[method];
  const nameHeader = headers.get("mcp-name");
  if (field !== undefined && nameHeader !== null && !isSentinel(nameHeader)) {
    const bodyValue = (params as Record<string, unknown> | null | undefined)?.[field];
    if (typeof bodyValue === "string" && bodyValue !== nameHeader) {
      return {
        header: "Mcp-Name",
        message: `Mcp-Name header "${clip(nameHeader)}" does not match the body params.${field} "${clip(bodyValue)}"`,
        data: { header: "Mcp-Name", headerValue: clip(nameHeader), bodyValue: clip(bodyValue) },
      };
    }
  }
  return undefined;
}

/** The method and name a request declares in its headers, for logs and routing. */
export function readStandardHeaders(headers: {
  get(name: string): string | null;
}): StandardHeaderView {
  const method = headers.get("mcp-method");
  const name = headers.get("mcp-name");
  return {
    ...(method !== null ? { method: clip(method) } : {}),
    ...(name !== null ? { name: clip(name) } : {}),
  };
}
