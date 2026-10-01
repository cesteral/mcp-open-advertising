// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Guard for caller-supplied report download URLs.
 *
 * Every `*_download_report` tool takes a URL from the MCP client and fetches it
 * server-side. A client is a model, and a model can be prompt-injected, so the
 * URL is untrusted input. Two failure modes follow:
 *
 * 1. **Credential leak.** Servers whose download URLs sit on the platform API
 *    host (cm360, sa360) attach the user's OAuth bearer token. Without a host
 *    check, `https://attacker.example/x` receives that token.
 * 2. **SSRF.** Servers that fetch presigned URLs anonymously can still be
 *    pointed at loopback, link-local (`169.254.169.254` — the cloud metadata
 *    service) or private addresses from inside the Cloud Run VPC.
 *
 * `assertSafeDownloadUrl` rejects both. Pass `allowedHostSuffixes` whenever the
 * request carries a credential; the generic checks apply either way.
 *
 * Scope: this validates the URL as written. A public hostname that resolves to
 * a private address (DNS rebinding) is not caught here.
 */

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";

export interface DownloadUrlGuardOptions {
  /**
   * Registrable host suffixes the URL must match — `"googleapis.com"` admits
   * `googleapis.com` and `www.googleapis.com`, never `googleapis.com.evil.io`.
   * Required whenever the fetch attaches credentials.
   */
  allowedHostSuffixes?: readonly string[];
  /** Tool name for the error message. */
  toolName?: string;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local"];

function isIpLiteral(hostname: string): boolean {
  // URL() keeps IPv6 literals bracketed; IPv4 (including the decimal/hex forms
  // WHATWG URL normalizes, e.g. http://2130706433/) comes back dotted-quad.
  return hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function matchesSuffix(hostname: string, suffix: string): boolean {
  const s = suffix.toLowerCase().replace(/^\./, "");
  return hostname === s || hostname.endsWith(`.${s}`);
}

/**
 * Why `rawUrl` must not be fetched, or `null` if it is acceptable.
 * Pure — exported for tests and for callers that want to decide themselves.
 */
export function checkDownloadUrl(
  rawUrl: string,
  options: DownloadUrlGuardOptions = {}
): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "is not a valid URL";
  }

  if (url.protocol !== "https:") {
    return `must use https (got ${url.protocol.replace(/:$/, "")})`;
  }
  if (url.username || url.password) {
    return "must not embed credentials";
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(hostname)) {
    return "must use a hostname, not an IP address";
  }
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    !hostname.includes(".")
  ) {
    return `host ${hostname} is not a public host`;
  }

  const allowed = options.allowedHostSuffixes;
  if (allowed && allowed.length > 0 && !allowed.some((s) => matchesSuffix(hostname, s))) {
    return `host ${hostname} is not an allowed report host (${allowed.join(", ")})`;
  }

  return null;
}

/**
 * Throw `InvalidParams` unless `rawUrl` is safe to fetch as a report download.
 * Call it before any network I/O — and before fetching a credential.
 */
export function assertSafeDownloadUrl(rawUrl: string, options: DownloadUrlGuardOptions = {}): void {
  const reason = checkDownloadUrl(rawUrl, options);
  if (reason) {
    const prefix = options.toolName ? `${options.toolName}: ` : "";
    throw new McpError(JsonRpcErrorCode.InvalidParams, `${prefix}download URL ${reason}`);
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Redirects a guarded download follows before giving up (Fetch's own limit is 20). */
export const MAX_GUARDED_DOWNLOAD_REDIRECTS = 5;

export interface GuardedDownloadOptions {
  timeoutMs: number;
  context?: { requestId?: string };
  init?: RequestInit;
  /** Tool name for error messages. */
  toolName?: string;
  /**
   * Request headers that carry a credential and must not reach another origin,
   * in addition to `Authorization` (e.g. `TTD-Auth`). Matched case-insensitively.
   */
  credentialHeaders?: readonly string[];
}

/**
 * GET a report download that `assertSafeDownloadUrl` already admitted,
 * following redirects by hand so each hop gets the same treatment:
 *
 * - Every redirect target passes the generic checks of `checkDownloadUrl`
 *   (https, a public hostname, no IP literal, no embedded credentials) before
 *   it is requested. With `redirect: "follow"` only the first URL was checked,
 *   so an admitted host could bounce the server to an internal address.
 * - Credential headers are dropped once the target's origin differs from the
 *   origin they were sent to. That is the Fetch standard's rule for
 *   `Authorization` on a cross-origin redirect (HTTP-redirect fetch, step
 *   "remove `Authorization` from request's header list"), applied here so it
 *   holds on every Node release and for custom credential headers, which the
 *   standard does not know about.
 *
 * The caller's host allowlist is not re-applied to redirect targets: a hop off
 * the allowlist no longer carries the credential the allowlist protects.
 */
export async function fetchGuardedDownload(
  url: string,
  options: GuardedDownloadOptions
): Promise<Response> {
  const credentialNames = new Set(
    ["authorization", ...(options.credentialHeaders ?? [])].map((h) => h.toLowerCase())
  );
  const headers = new Headers(options.init?.headers);
  let current = new URL(url);
  const deadline = Date.now() + options.timeoutMs;

  for (let hop = 0; ; hop++) {
    const response = await fetchWithTimeout(
      current.href,
      Math.max(1, deadline - Date.now()),
      options.context,
      {
        ...options.init,
        headers: Object.fromEntries(headers.entries()),
        redirect: "manual",
      }
    );

    const location = response.headers.get("location");
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response;

    const prefix = options.toolName ? `${options.toolName}: ` : "";
    if (hop >= MAX_GUARDED_DOWNLOAD_REDIRECTS) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `${prefix}report download redirected more than ${MAX_GUARDED_DOWNLOAD_REDIRECTS} times`
      );
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `${prefix}report download redirected to an invalid location`
      );
    }
    const reason = checkDownloadUrl(next.href);
    if (reason) {
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `${prefix}report download redirect refused: target ${reason}`
      );
    }

    if (next.origin !== current.origin) {
      for (const name of [...headers.keys()]) {
        if (credentialNames.has(name.toLowerCase())) headers.delete(name);
      }
    }
    // Release the redirect response's connection before the next request.
    await response.body?.cancel().catch(() => undefined);
    current = next;
  }
}
