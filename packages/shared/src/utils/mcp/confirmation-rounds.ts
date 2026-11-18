// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Destructive-operation confirmation as a Multi Round-Trip Request (SEP-2322,
 * #244).
 *
 * The handler used to ask mid-call with a server-initiated `elicitation/create`.
 * The 2026-07-28 revision has no server-initiated requests: the handler answers
 * `resultType: "input_required"` with the question and an opaque `requestState`,
 * and the client re-issues the SAME `tools/call` with `inputResponses`. On a
 * 2025-era connection the SDK's legacy shim performs the same exchange (a real
 * `elicitation/create`, then handler re-entry), so one handler serves both eras.
 *
 * What makes the round trip safe is in this file:
 *
 *  - `requestState` is attacker-controlled (it travels through the client), so
 *    it is HMAC-sealed and bound to the principal, the tool, the digest of the
 *    exact arguments that were asked about, and an expiry. It is signed, not
 *    encrypted: it carries digests, a nonce and the user's own answers, never
 *    platform text. It is never authorization on its own; it only proves that
 *    an answer belongs to this principal, this tool and these arguments.
 *  - A client answer is keyed by a digest of the exact prompt text, so an answer
 *    to one question cannot satisfy another.
 *  - Each sealed state carries a nonce that is consumed once, when its answer is
 *    first used. Replaying the retry finds the nonce spent, the answer is
 *    ignored and the user is asked again.
 *
 * The guard that verifies the state wraps the SDK's registered `tools/call`
 * handler, so a bad state is answered as the wire-level `-32602` the spec asks
 * for (a throw from inside a tool callback would be turned into an `isError`
 * result by the SDK).
 */

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { JsonRpcErrorCode, McpError } from "../mcp-errors.js";

/** Reserved `_meta` key on a 2026-07-28 request that carries the client's capabilities. */
export const CLIENT_CAPABILITIES_ENVELOPE_KEY = "io.modelcontextprotocol/clientCapabilities";

/** Human-paced: long enough to read a prompt, short enough to bound a stolen state. */
export const REQUEST_STATE_TTL_SECONDS = 600;

const STATE_PREFIX = "v1";
const MIN_SECRET_LENGTH = 32;
/** Key-derivation label: keeps this key distinct from the auth secret it may derive from. */
const DERIVATION_LABEL = "cesteral.requestState.v1";
const REQUEST_KEY_PREFIX = "confirm-";
/** Namespaces approval nonces away from decision-token jtis in the shared store. */
export const APPROVAL_NONCE_PREFIX = "mrtr:";

export interface ElicitAnswer {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}

/** What the sealed `requestState` carries. */
export interface ConfirmationPayload {
  /** Tool name. */
  t: string;
  /** Digest of the raw `arguments` that were asked about. */
  a: string;
  /** Answers collected in earlier rounds of this call, by request key. */
  ans: Record<string, ElicitAnswer>;
  /** Single-use nonce of this state. */
  n: string;
}

/** The elicitation the handler asks for. */
export interface ElicitParams {
  message: string;
  requestedSchema: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Thrown by the call's `sdkContext.elicitInput` when the answer is not in hand.
 * The factory turns it into an `input_required` result; nothing else may catch it.
 */
export class ConfirmationRequired extends Error {
  constructor(
    readonly requestKey: string,
    readonly params: ElicitParams
  ) {
    super("input required");
    this.name = "ConfirmationRequired";
  }
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

/** JSON with object keys sorted at every depth, so equal values digest equally. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Digest of a call's raw arguments. `undefined` and `{}` are the same call. */
export function digestArguments(rawArgs: unknown): string {
  return sha256Hex(canonicalJson(rawArgs ?? {}));
}

/** The key a prompt's answer travels under: derived from the exact prompt. */
export function requestKeyFor(params: ElicitParams): string {
  return `${REQUEST_KEY_PREFIX}${sha256Hex(canonicalJson(params)).slice(0, 24)}`;
}

// ---------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString("base64url");

let processKey: Buffer | undefined;

/**
 * The HMAC key. Every instance that may receive a retry must hold the same one:
 *
 *  1. `MCP_REQUEST_STATE_SECRET` (at least 32 characters), else
 *  2. derived from `MCP_AUTH_SECRET_KEY` (jwt mode), under a distinct label, else
 *  3. a random per-process key. A retry that lands on another instance then
 *     fails closed with `-32602` and the client starts the call again.
 */
export function resolveRequestStateKey(
  env: Record<string, string | undefined> = process.env
): Buffer {
  const explicit = env.MCP_REQUEST_STATE_SECRET;
  if (explicit !== undefined && explicit !== "") {
    if (explicit.length < MIN_SECRET_LENGTH) {
      throw new Error(`MCP_REQUEST_STATE_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return Buffer.from(explicit, "utf8");
  }
  const auth = env.MCP_AUTH_SECRET_KEY;
  if (auth) return createHmac("sha256", auth).update(DERIVATION_LABEL).digest();
  return (processKey ??= randomBytes(32));
}

function sign(key: Buffer, body: string): Buffer {
  return createHmac("sha256", key).update(body).digest();
}

function principalTag(key: Buffer, principal: string): string {
  return b64url(
    createHmac("sha256", key).update(`principal:${principal}`).digest().subarray(0, 16)
  );
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function mintRequestState(
  key: Buffer,
  payload: ConfirmationPayload,
  principal: string,
  nowMs: number = Date.now()
): string {
  const body = b64url(
    JSON.stringify({
      p: payload,
      exp: Math.floor(nowMs / 1000) + REQUEST_STATE_TTL_SECONDS,
      b: principalTag(key, principal),
    })
  );
  return `${STATE_PREFIX}.${body}.${b64url(sign(key, `${STATE_PREFIX}.${body}`))}`;
}

/** Throws one opaque error for every failure; the reason is deliberately not surfaced. */
export function verifyRequestState(
  key: Buffer,
  state: string,
  principal: string,
  nowMs: number = Date.now()
): ConfirmationPayload {
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== STATE_PREFIX) throw new Error("malformed");
  const [, body, mac] = parts;
  if (!safeEqual(Buffer.from(mac, "base64url"), sign(key, `${STATE_PREFIX}.${body}`))) {
    throw new Error("mac");
  }
  let envelope: { p?: unknown; exp?: unknown; b?: unknown };
  try {
    envelope = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new Error("malformed");
  }
  if (typeof envelope.exp !== "number" || Math.floor(nowMs / 1000) >= envelope.exp) {
    throw new Error("expired");
  }
  if (
    typeof envelope.b !== "string" ||
    !safeEqual(Buffer.from(envelope.b), Buffer.from(principalTag(key, principal)))
  ) {
    throw new Error("bind");
  }
  const p = envelope.p as Partial<ConfirmationPayload> | undefined;
  if (
    !p ||
    typeof p.t !== "string" ||
    typeof p.a !== "string" ||
    typeof p.n !== "string" ||
    typeof p.ans !== "object" ||
    p.ans === null
  ) {
    throw new Error("malformed");
  }
  return p as ConfirmationPayload;
}

// ---------------------------------------------------------------------------
// Per-round state
// ---------------------------------------------------------------------------

export interface ConfirmationRound {
  tool: string;
  argsDigest: string;
  /** Answers usable this round: sealed earlier answers plus this round's responses. */
  answered: Record<string, ElicitAnswer>;
  /** Nonce of the state this round arrived with; absent on a first, plain call. */
  nonce?: string;
  /**
   * The answers this round actually used. Only these are sealed into the next
   * state: carrying an answer whose nonce was already spent would launder a
   * replayed approval into a fresh state.
   */
  used: Record<string, ElicitAnswer>;
}

/** `ctx.mcpReq.inputResponses` entries that are well-formed elicitation answers. */
function answersFromResponses(responses: unknown): Record<string, ElicitAnswer> {
  const out: Record<string, ElicitAnswer> = {};
  if (!responses || typeof responses !== "object") return out;
  for (const [k, v] of Object.entries(responses as Record<string, unknown>)) {
    if (!k.startsWith(REQUEST_KEY_PREFIX) || !v || typeof v !== "object") continue;
    const { action, content } = v as { action?: unknown; content?: unknown };
    if (action !== "accept" && action !== "decline" && action !== "cancel") continue;
    out[k] =
      action === "accept" && content && typeof content === "object" && !Array.isArray(content)
        ? { action, content: content as Record<string, unknown> }
        : { action };
  }
  return out;
}

function invalidRequestState(): McpError {
  return new McpError(JsonRpcErrorCode.InvalidParams, "Invalid or expired requestState", {
    reason: "invalid_request_state",
  });
}

interface RoundInput {
  key: Buffer;
  tool: string;
  /** The raw `arguments` of the call, as sent. */
  rawArgs: unknown;
  /** `ctx.mcpReq.requestState()`: the wire string, or `undefined` on a plain call. */
  requestState: unknown;
  /** `ctx.mcpReq.inputResponses`. */
  inputResponses: Record<string, unknown> | undefined;
  principal: string;
  now?: number;
}

/**
 * The round a `tools/call` is in. A plain call has nothing answered. A retry
 * must carry a `requestState` that verifies and belongs to this principal, this
 * tool and these exact arguments; anything else throws the `-32602` McpError.
 */
export function resolveRound(input: RoundInput): ConfirmationRound {
  const argsDigest = digestArguments(input.rawArgs);
  const hasResponses = !!input.inputResponses && Object.keys(input.inputResponses).length > 0;
  if (input.requestState === undefined && !hasResponses) {
    return { tool: input.tool, argsDigest, answered: {}, used: {} };
  }
  // Answers without a state we sealed cannot be tied to these arguments.
  if (typeof input.requestState !== "string") throw invalidRequestState();
  let payload: ConfirmationPayload;
  try {
    payload = verifyRequestState(input.key, input.requestState, input.principal, input.now);
  } catch {
    throw invalidRequestState();
  }
  // Same state, different call: an approval for one tool or one set of
  // arguments never rides on another.
  if (payload.t !== input.tool || payload.a !== argsDigest) throw invalidRequestState();
  return {
    tool: input.tool,
    argsDigest,
    answered: { ...payload.ans, ...answersFromResponses(input.inputResponses) },
    nonce: payload.n,
    used: {},
  };
}

interface GuardOptions {
  key: Buffer;
  /** Who is calling. Re-read per request: a session's credentials are not fixed at registration. */
  principalOf: () => string;
  now?: () => number;
}

interface ProtocolLike {
  _requestHandlers?: Map<string, (request: unknown, extra: unknown) => unknown>;
}

const GUARD_MARK = "__cesteralConfirmationGuard";

/**
 * Refuse a retry whose `requestState` does not verify with the wire-level
 * `-32602`, before any tool code runs. Wraps the SDK's registered `tools/call`
 * handler: a throw from inside a tool callback would be turned into an
 * `isError` result by the SDK, and the spec asks for a protocol error.
 *
 * It only rejects. The round itself is resolved again inside the tool callback
 * ({@link resolveRound}), which also covers the legacy shim's in-process
 * re-entries: the shim calls the inner handler directly, past this wrapper.
 *
 * Like `installRawToolArgsCapture` this reaches into `_requestHandlers`, which
 * the SDK does not export: feature-detected, and `confirmation-rounds.test.ts`
 * fails if an SDK upgrade breaks it. Returns `false` when it cannot install, and
 * the caller then offers no confirmation channel at all (irreversible operations
 * are refused, never silently confirmed).
 *
 * Call AFTER at least one tool is registered (`McpServer` installs `tools/call`
 * lazily).
 */
export function installConfirmationGuard(protocol: unknown, opts: GuardOptions): boolean {
  const handlers = (protocol as ProtocolLike | undefined)?._requestHandlers;
  if (!(handlers instanceof Map)) return false;
  const original = handlers.get("tools/call");
  if (typeof original !== "function") return false;
  if ((original as unknown as Record<string, unknown>)[GUARD_MARK]) return true;

  const wrapped = (request: unknown, extra: unknown): unknown => {
    const params = (request as { params?: { name?: unknown; arguments?: unknown } } | undefined)
      ?.params;
    const mcpReq = (
      extra as
        | { mcpReq?: { requestState?: () => unknown; inputResponses?: Record<string, unknown> } }
        | undefined
    )?.mcpReq;
    resolveRound({
      key: opts.key,
      tool: typeof params?.name === "string" ? params.name : "",
      rawArgs: params?.arguments,
      requestState: typeof mcpReq?.requestState === "function" ? mcpReq.requestState() : undefined,
      inputResponses: mcpReq?.inputResponses,
      principal: opts.principalOf(),
      now: opts.now?.(),
    });
    return original(request, extra);
  };
  (wrapped as unknown as Record<string, unknown>)[GUARD_MARK] = true;
  handlers.set("tools/call", wrapped);
  return true;
}

// ---------------------------------------------------------------------------
// The call's `elicitInput`
// ---------------------------------------------------------------------------

/**
 * Whether the client can answer a form elicitation on THIS call. A 2026-07-28
 * request declares its capabilities per request in `_meta`; a 2025-era
 * connection declared them once at `initialize`.
 */
export function clientCanElicit(
  envelope: Record<string, unknown> | undefined,
  initializeCapabilities: unknown
): boolean {
  const caps =
    envelope && CLIENT_CAPABILITIES_ENVELOPE_KEY in envelope
      ? envelope[CLIENT_CAPABILITIES_ENVELOPE_KEY]
      : initializeCapabilities;
  const elicitation = (caps as { elicitation?: Record<string, unknown> } | undefined)?.elicitation;
  if (!elicitation || typeof elicitation !== "object") return false;
  // `elicitation: {}` means form mode; a URL-only client cannot answer a form.
  return elicitation.form !== undefined || Object.keys(elicitation).length === 0;
}

export interface ElicitInputDeps {
  round: ConfirmationRound;
  /** True when the input has `dryRun: true`: a dry run never prompts. */
  dryRun: boolean;
  /** Consume-once: `fresh` the first time, `replayed` after. */
  consumeNonce: (nonce: string) => Promise<"fresh" | "replayed">;
}

/**
 * The `elicitInput` a tool sees. It answers from the round's `inputResponses`,
 * or throws {@link ConfirmationRequired} so the factory can answer
 * `input_required`. Same shape the tools already call, so none of them change.
 */
export function createElicitInput(
  deps: ElicitInputDeps
): (params: Record<string, unknown>) => Promise<ElicitAnswer> {
  let nonceUse: Promise<boolean> | undefined;
  return async (params) => {
    if (deps.dryRun) {
      throw new McpError(
        JsonRpcErrorCode.InternalError,
        "A dry run must not ask for confirmation: it changes nothing"
      );
    }
    const elicit = params as ElicitParams;
    const requestKey = requestKeyFor(elicit);
    const { round } = deps;
    const answer = round.answered[requestKey];
    if (answer && round.nonce) {
      // The state's nonce is spent the first time one of its answers is used.
      // A replay finds it spent and is asked again instead of being believed.
      nonceUse ??= deps.consumeNonce(round.nonce).then((r) => r === "fresh");
      if (await nonceUse) {
        round.used[requestKey] = answer;
        return answer.content === undefined
          ? { action: answer.action }
          : { action: answer.action, content: answer.content };
      }
    }
    throw new ConfirmationRequired(requestKey, elicit);
  };
}

/** The `input_required` result for a question, with a freshly sealed state. */
export function buildInputRequired(
  key: Buffer,
  principal: string,
  round: ConfirmationRound,
  signal: ConfirmationRequired
): Record<string, unknown> {
  const requestState = mintRequestState(
    key,
    { t: round.tool, a: round.argsDigest, ans: round.used, n: randomUUID() },
    principal
  );
  return {
    resultType: "input_required",
    inputRequests: {
      [signal.requestKey]: {
        method: "elicitation/create",
        params: { mode: "form", ...signal.params },
      },
    },
    requestState,
  };
}
