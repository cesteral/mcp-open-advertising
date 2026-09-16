// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { AsyncLocalStorage } from "async_hooks";

/**
 * Raw, pre-validation `tools/call` arguments for the invocation in flight.
 *
 * `@cesteral/contract-hash`'s `canonicalizeExecutableArgs` is contracted to
 * operate on the RAW wire shape precisely so that "Zod
 * defaults/coercions/transforms/unknown-key stripping cannot diverge the hash
 * across repos". The governance layer honours that when it mints a decision
 * token's `actionHash` — it hashes the arguments it dispatched.
 *
 * A tool handler cannot honour it on its own: the MCP SDK validates
 * `request.params.arguments` against the tool's `inputSchema` and hands the
 * handler `parseResult.data`, so every `.default()` in the schema — at any
 * depth — is materialized before the handler, and therefore the hash, ever sees
 * it. Hashing that parsed object is what diverged the two sides (10-F2).
 *
 * This storage carries the unparsed arguments across that boundary, so the
 * verifier hashes the same bytes the minter did.
 */
const rawToolArgsStorage = new AsyncLocalStorage<unknown>();

/**
 * The unparsed `params.arguments` for the current tool call, or `undefined`
 * when capture is not installed (see `installRawToolArgsCapture`).
 *
 * `undefined` is meaningful: it means "unknown", not "the client sent nothing".
 * A client that sends no arguments yields `{}` or `null` from the wire, never
 * `undefined`, because capture always runs when installed.
 */
export function getRawToolArgs(): unknown {
  return rawToolArgsStorage.getStore();
}

/** Run `fn` with `rawArgs` visible to `getRawToolArgs()`. Exported for tests. */
export function runWithRawToolArgs<T>(rawArgs: unknown, fn: () => T): T {
  return rawToolArgsStorage.run(rawArgs, fn);
}

/** Minimal structural view of the SDK protocol object this module touches. */
interface ProtocolLike {
  _requestHandlers?: Map<string, (request: unknown, extra: unknown) => unknown>;
}

const CALL_TOOL_METHOD = "tools/call";

/**
 * Wrap the SDK's already-registered `tools/call` handler so the raw arguments
 * are visible to `getRawToolArgs()` for the duration of the call.
 *
 * Why wrap rather than read the arguments inside the tool handler: the SDK
 * gives a `registerTool` callback only `(parsedArgs, extra)`. `extra` does not
 * carry the request, and the schema the SDK parses with is the same object it
 * publishes in `tools/list` — so the defaults cannot be suppressed for
 * validation without changing the published schema, which would change every
 * `definitionHash` and break cross-repo parity. Intercepting above the parse is
 * the only place the unparsed shape still exists.
 *
 * This reaches into `_requestHandlers`, which the SDK does not export. That is
 * deliberate and contained: it is feature-detected, it is a no-op when the
 * shape is not what we expect, and `raw-tool-args.test.ts` fails loudly if an
 * SDK upgrade breaks it. A silent regression here would not open a bypass —
 * the verifier falls back to the parsed args, which is exactly today's
 * behaviour — but it would quietly restore the false `action_hash_mismatch`
 * rejections this exists to prevent, so CI must see it before a deploy does.
 *
 * Call AFTER at least one tool is registered: `McpServer` installs its
 * `tools/call` handler lazily on first `registerTool`.
 *
 * @returns `true` when the interceptor was installed.
 */
export function installRawToolArgsCapture(protocol: unknown): boolean {
  const handlers = (protocol as ProtocolLike | undefined)?._requestHandlers;
  if (!(handlers instanceof Map)) return false;

  const original = handlers.get(CALL_TOOL_METHOD);
  if (typeof original !== "function") return false;

  // Idempotent: re-installing would nest the wrappers, and the inner store
  // would win. Servers that register tools in more than one batch would
  // otherwise double-wrap.
  if ((original as { __cesteralRawArgsWrapped?: boolean }).__cesteralRawArgsWrapped) return true;

  const wrapped = (request: unknown, extra: unknown): unknown => {
    const rawArgs = (request as { params?: { arguments?: unknown } } | undefined)?.params
      ?.arguments;
    return rawToolArgsStorage.run(rawArgs, () => original(request, extra));
  };
  (wrapped as { __cesteralRawArgsWrapped?: boolean }).__cesteralRawArgsWrapped = true;

  handlers.set(CALL_TOOL_METHOD, wrapped);
  return true;
}
