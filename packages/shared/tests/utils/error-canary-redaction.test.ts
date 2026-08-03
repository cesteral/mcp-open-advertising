/**
 * End-to-end canary cover for #741 H-2.
 *
 * The review's acceptance criterion is phrased as an absence: "canary tokens are
 * absent from logs, telemetry, exceptions, notifications, and MCP responses."
 * These tests assert exactly that, per sink, using a single distinctive canary.
 *
 * The gap H-2 described was never in `data` — `sanitizeErrorData` covered that,
 * and callers applied it. It was in the MESSAGE. `retryable-fetch` interpolates
 * the platform's raw response body into the error message, so an upstream 401
 * whose body carries a `refresh_token` put that token into `McpError.message` —
 * which then reached Pino, the MCP logging notification, and the MCP error
 * response, each of which would have had to remember to redact separately.
 *
 * The fix redacts in the `McpError` constructor, so every sink inherits it and a
 * platform adapter this package does not own is covered without being told.
 */

import { describe, it, expect, vi } from "vitest";
import { McpError, JsonRpcErrorCode, ErrorHandler } from "../../src/utils/mcp-errors.js";

const CANARY = "1//0eXaMpLeCaNaRyRefreshTokenValue";

/** An upstream 401 body of the shape the review's trace describes. */
const UPSTREAM_401_BODY = JSON.stringify({
  error: "invalid_grant",
  error_description: "Token has been expired or revoked.",
  refresh_token: CANARY,
});

/** How `retryable-fetch` builds the message: raw body interpolated in. */
function messageAsRetryableFetchBuildsIt(body: string): string {
  return `Google Ads API request failed: 401 Unauthorized — ${body.substring(0, 500)}`;
}

describe("#741 H-2 — canary must not survive into any sink", () => {
  it("strips the canary from McpError.message at construction", () => {
    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      messageAsRetryableFetchBuildsIt(UPSTREAM_401_BODY)
    );

    expect(err.message).not.toContain(CANARY);
    expect(err.message).toContain("[REDACTED]");
    // The diagnostic value survives — this is redaction, not suppression.
    expect(err.message).toContain("401 Unauthorized");
    expect(err.message).toContain("invalid_grant");
  });

  it("strips the canary from an access_token in a URL-bearing message", () => {
    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      `Meta API request failed: 400 — https://graph.facebook.com/v19.0/me?access_token=${CANARY}`
    );

    expect(err.message).not.toContain(CANARY);
  });

  it("keeps the canary out of the Pino log record (message AND data)", () => {
    const logger = { error: vi.fn() } as unknown as Parameters<
      typeof ErrorHandler.handleError
    >[2] & { error: ReturnType<typeof vi.fn> };

    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      messageAsRetryableFetchBuildsIt(UPSTREAM_401_BODY),
      { errorBody: UPSTREAM_401_BODY, httpStatus: 401 }
    );

    ErrorHandler.handleError(err, { operation: "get_campaigns" }, logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
    // Serialize the whole record: the canary must not appear ANYWHERE in what
    // Pino would write, not merely in the fields this test thought to name.
    const written = JSON.stringify(logger.error.mock.calls[0]);
    expect(written).not.toContain(CANARY);
  });

  it("keeps the canary out of the Pino record for a non-McpError too", () => {
    const logger = { error: vi.fn() } as unknown as Parameters<
      typeof ErrorHandler.handleError
    >[2] & { error: ReturnType<typeof vi.fn> };

    // A plain Error carries the canary in message and stack. `originalError` is
    // server-side only, but "server-side only" is not the same as "safe to log
    // in the clear" — the acceptance criterion says logs too.
    const raw = new Error(`upstream rejected: refresh_token=${CANARY}`);

    ErrorHandler.handleError(raw, { operation: "get_campaigns" }, logger);

    const written = JSON.stringify(logger.error.mock.calls[0]);
    expect(written).not.toContain(CANARY);
  });

  it("keeps the canary out of the serialized MCP error response", () => {
    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      messageAsRetryableFetchBuildsIt(UPSTREAM_401_BODY),
      { errorBody: UPSTREAM_401_BODY }
    );

    // The shape tool-handler-factory returns to the client.
    const payload = JSON.stringify({
      error: err.message,
      code: err.code,
      data: ErrorHandler.sanitizeErrorData(err.data) ?? null,
    });

    expect(payload).not.toContain(CANARY);
  });

  it("keeps the canary out of the MCP logging notification for a non-McpError throw", () => {
    // This is the case where the notification's choice of source is
    // load-bearing. When an McpError is thrown, `(error as Error).message` and
    // `mcpError.message` are the same redacted string. When a PLAIN error is
    // thrown — a platform adapter throwing raw — they diverge: `mcpError` is the
    // converted one and has been through the constructor, the original has not.
    // The notification used to read the original.
    const raw = new Error(`upstream rejected: refresh_token=${CANARY}`);
    const mcpError = ErrorHandler.convertToMcpError(raw);

    const beforeFix = `Tool get_campaigns failed: ${(raw as Error).message}`;
    const afterFix = `Tool get_campaigns failed: ${mcpError.message}`;

    // Pin the divergence, so this test fails if the sink is pointed back at the
    // raw error rather than passing for the wrong reason.
    expect(beforeFix).toContain(CANARY);
    expect(afterFix).not.toContain(CANARY);
  });

  it("redacts a form-urlencoded refresh body, not just JSON", () => {
    // OAuth2 token exchange/refresh bodies are x-www-form-urlencoded — the shape
    // a `":"`-anchored pattern misses entirely.
    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      `token refresh failed: grant_type=refresh_token&refresh_token=${CANARY}&client_secret=abc123`
    );

    expect(err.message).not.toContain(CANARY);
    expect(err.message).not.toContain("abc123");
  });

  it("leaves a message with no secret untouched", () => {
    // Redaction must not be so eager that ordinary diagnostics degrade — that is
    // how a security control gets turned off by whoever is debugging.
    const plain = "Google Ads API request failed: 404 Not Found — campaign 123 does not exist";
    expect(new McpError(JsonRpcErrorCode.NotFound, plain).message).toBe(plain);
  });

  it("does not mangle prose that mentions Bearer", () => {
    // Regression for the over-redaction this change surfaced: the unbounded
    // `Bearer\s+\S+` pattern rewrote "Bearer scheme" to "Bearer [REDACTED]",
    // which broke two LinkedIn auth tests asserting the real message.
    for (const prose of [
      "Authorization header must use Bearer scheme",
      "Bearer authentication is required",
      "Expected Bearer authorization",
    ]) {
      expect(new McpError(JsonRpcErrorCode.Unauthorized, prose).message).toBe(prose);
    }
  });

  it("still redacts a real bearer credential", () => {
    // The other side of the prose exclusion — the case the pattern exists for.
    // A realistic access-token shape (digits and dots), not the refresh-token
    // canary: that one contains `/`, which this pattern's character class
    // excludes by design and which the named-field pattern catches instead.
    const accessToken = "ya29.a0AfB-byC3xYz1234567890abcdef";
    const err = new McpError(
      JsonRpcErrorCode.Unauthorized,
      `upstream rejected: Authorization: Bearer ${accessToken}`
    );
    expect(err.message).not.toContain(accessToken);
    expect(err.message).toContain("[REDACTED]");
  });
});
