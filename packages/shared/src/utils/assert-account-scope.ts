// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";

/**
 * Fail-fast guard for single-account session binding.
 *
 * Several platform tools declare a REQUIRED account-scoping parameter in their
 * Zod input schema (e.g. `advertiserId`, `adAccountId`, `profileId`) but their
 * handlers do not read it — the account bound to the session at authentication
 * time is always used instead. Without this guard, a caller that names account
 * B while the session is bound to account A has its call (including writes)
 * silently execute against account A. That is a wrong-account execution the
 * schema actively lies about.
 *
 * Call this immediately after resolving the session services in any handler
 * that declares the scoping parameter but delegates account selection to the
 * session-bound client. It turns the silent mismatch into a loud
 * `InvalidParams` error.
 *
 * @param declared  The caller-supplied scoping value from the tool input. When
 *                  `undefined` (parameter omitted / optional), no assertion is
 *                  made — the session-bound account is used as before.
 * @param bound     The account id the session is actually bound to.
 * @param paramName The input parameter name, used in the error message.
 *
 * @throws {McpError} `JsonRpcErrorCode.InvalidParams` when `declared` is set and
 *                    does not equal `bound`.
 */
export function assertAccountScope(
  declared: string | undefined,
  bound: string,
  paramName: string
): void {
  if (declared !== undefined && declared !== bound) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `${paramName} '${declared}' does not match this session's account '${bound}'. This session is bound to a single account.`
    );
  }
}
