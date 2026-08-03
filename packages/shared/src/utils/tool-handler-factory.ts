// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool Handler Factory
 *
 * Extracts common MCP tool registration boilerplate into a reusable handler.
 * All MCP servers use this to register tools with consistent context creation,
 * telemetry, error handling, and metrics.
 *
 * Compliant with MCP Specification 2025-11-25:
 * - Forwards title, annotations, outputSchema to the SDK
 * - Returns structuredContent alongside content when outputSchema is defined
 * - Uses structural typing to avoid coupling the shared package to the MCP SDK
 */

import type { Logger } from "pino";
import { z } from "zod";
import { withToolSpan, setSpanAttribute, recordSpanError } from "./telemetry.js";
import { ErrorHandler, McpError } from "./mcp-errors.js";
import { recordToolExecution } from "./metrics.js";
import {
  type InteractionLogger,
  type InteractionLogEntry,
  sanitizeParams,
} from "./interaction-logger.js";
import { getRecordedUpstreamRequests } from "./http-request-recorder.js";
import {
  runWithRequestContext,
  getRequestContext,
  type RequestContext,
} from "./request-context.js";
import type { SessionAuthContext } from "../auth/auth-strategy.js";
import { JsonRpcErrorCode } from "./mcp-errors.js";
import { hashActionInput, canonicalizeExecutableArgs } from "@cesteral/contract-hash";
import { resolveTokenMode } from "../governance/config.js";
import { verifyDecisionToken } from "../governance/decision-token.js";
import { logDecisionTokenVerdict } from "../governance/audit.js";
import { InMemoryJtiStore, type JtiStore } from "../governance/jti-store.js";
import { getGovernanceJtiStore } from "../governance/runtime.js";
import type { CesteralToolAnnotations } from "../types/cesteral-annotations.js";

/** Default decision-token jti TTL (10 min) — must be ≥ the token's own TTL. */
const DEFAULT_JTI_TTL_MS = 600_000;

/**
 * Lazily-created in-memory jti store — the last resort when neither an explicit
 * `opts.jtiStore` nor a process-level store from `initializeGovernanceRuntime`
 * is available (stdio one-offs, tests, direct callers).
 */
let fallbackJtiStore: JtiStore | undefined;
function getFallbackJtiStore(): JtiStore {
  return (fallbackJtiStore ??= new InMemoryJtiStore());
}

/**
 * Resolution order for the jti store, most explicit first:
 *
 *   1. `opts.jtiStore` — an explicit injection wins, always.
 *   2. The process-level store resolved at boot by `initializeGovernanceRuntime`
 *      (issue #166). This is what makes a distributed store reachable without
 *      threading it through every `createMcpServer` signature: `bootstrapMcpServer`
 *      resolves it once, and every per-session registration picks it up here.
 *   3. A per-process in-memory store.
 */
function resolveJtiStore(explicit: JtiStore | undefined): JtiStore {
  return explicit ?? getGovernanceJtiStore() ?? getFallbackJtiStore();
}

/**
 * Decide what to do when governed writes resolve to `enforce` but the factory
 * fell back to the in-memory jti store (external-write-rail review P3).
 *
 * In-memory replay protection is correct for stdio / self-host / single
 * instance but does NOT hold across Cloud Run instances: a replayed decision
 * token routed to a second instance is accepted as fresh, so an at-most-once
 * guarantee the operator believes `enforce` gives them is silently absent.
 *
 * The signal is the STORE'S OWN `distributed` declaration, not "was a store
 * injected?" (sweep 2026-07-25, 10-F1). The old `storeInjected` short-circuit
 * meant that following half of CLAUDE.md §6's remediation — wiring
 * `selectJtiStore(...)` without setting `GOVERNANCE_JTI_STORE=firestore` — handed
 * the factory an `InMemoryJtiStore` and returned `ok` before the hosted branch
 * ran: an in-memory enforce posture on multi-instance Cloud Run with no throw
 * and no warn, i.e. QUIETER than doing nothing, which correctly throws. A store
 * that does not declare `distributed` is treated as not distributed.
 *
 * - Not enforcing, or the effective store declares itself distributed → `ok`.
 * - `GOVERNANCE_JTI_STORE=firestore` is set but the effective store is not
 *   distributed → the deployment INTENDED a distributed store and did not get
 *   one (never wired `selectJtiStore` into the factory, or wired a store that
 *   does not provide the guarantee). A misconfiguration on a money-moving path
 *   → `throw` (unless explicitly allowed).
 * - A hosted signal is present (`K_SERVICE` — Cloud Run always sets it) → the
 *   process can scale out, so in-memory enforce is unsafe → `throw` (unless
 *   explicitly allowed).
 * - Otherwise (no hosted signal — stdio / self-host) → `warn`: in-memory is
 *   the correct store there.
 *
 * `GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE=true` downgrades a `throw` to a
 * `warn` for a deployment that has deliberately pinned itself to a single
 * instance and accepts the per-instance limitation.
 */
export function evaluateJtiStoreEnforcementSafety(params: {
  anyEnforce: boolean;
  /**
   * Whether the store that will actually be used declares a cross-process
   * consume-once guarantee (`JtiStore.distributed === true`). Absent or false
   * means it does not — including for a custom store that never declared one.
   */
  storeDistributed: boolean;
  env: Record<string, string | undefined>;
}): { action: "ok" | "warn" | "throw"; reason?: string } {
  const { anyEnforce, storeDistributed, env } = params;
  if (!anyEnforce || storeDistributed) return { action: "ok" };

  const allowInMemory =
    (env.GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE ?? "").trim().toLowerCase() === "true";
  const declaredFirestore = env.GOVERNANCE_JTI_STORE === "firestore";
  const hosted = typeof env.K_SERVICE === "string" && env.K_SERVICE.length > 0;

  if (declaredFirestore) {
    const reason =
      "GOVERNANCE_JTI_STORE=firestore is set but the jti store in use is not distributed — " +
      "the distributed store was never wired into registerToolsFromDefinitions (inject " +
      "selectJtiStore's result as `jtiStore`), or the injected store does not declare " +
      "`distributed = true`. Enforce-mode replay protection is not active.";
    return { action: allowInMemory ? "warn" : "throw", reason };
  }

  if (hosted) {
    const reason =
      "Decision-token enforcement is active on a hosted (Cloud Run) deployment with a " +
      "non-distributed jti store — replay protection does not hold across instances. Set " +
      "GOVERNANCE_JTI_STORE=firestore and inject selectJtiStore's result as `jtiStore`.";
    return { action: allowInMemory ? "warn" : "throw", reason };
  }

  return {
    action: "warn",
    reason:
      "Decision-token enforcement is enabled with a non-distributed jti store — replay " +
      "protection does not hold across multiple instances. Inject a distributed JtiStore " +
      "(selectJtiStore + GOVERNANCE_JTI_STORE=firestore) before scaling out.",
  };
}

/**
 * Default maximum character length for text content blocks in tool responses.
 * Prevents context window overflow for AI agents processing large responses.
 * Can be overridden per-server via RegisterToolsOptions.responseCharacterLimit.
 */
export const RESPONSE_CHARACTER_LIMIT = 25_000;

/**
 * Input keys that carry an identifier in the SAME id-space as the JWT
 * `allowed_advertisers` claim, and are therefore checked against it.
 *
 * Membership is a statement about id-space, not about naming. Two rules:
 *
 * 1. A key belongs here only if its value is an advertiser-equivalent account
 *    id. `accountId` qualifies — in Microsoft Advertising the *account* is the
 *    advertiser-equivalent, and msads tools name it plainly (`get-entity`,
 *    `duplicate-entity`, `get-pacing-status`, `create-report-schedule`).
 *
 * 2. `profileId` deliberately does NOT belong here, even though Amazon DSP
 *    tools take it and it looks scope-shaped. An Amazon `profileId` becomes the
 *    `Amazon-Advertising-API-Scope` header — it is a session-bound CREDENTIAL
 *    scope, a different id-space from the JWT advertiser scope, and Amazon
 *    tools carry `advertiserId` separately for the latter. Adding it here would
 *    test a profile id against a list of advertiser ids and deny every Amazon
 *    call in jwt mode — converting a fail-open into a fail-closed outage.
 *    Profile scoping is enforced instead by `assertAccountScope`, which
 *    compares the caller-supplied profile against the session-bound one.
 *
 * Anything not listed here contributes no scoped identifiers, so it is NOT
 * denied — absence of a match is indistinguishable from authorisation, which
 * is why the set must be kept complete rather than convenient (C-2).
 */
const SCOPED_ID_KEYS = new Set<string>([
  "advertiserId",
  "customerId",
  "partnerId",
  "adAccountId",
  "adAccountUrn",
  "accountId",
] as const);
const SCOPED_ID_ARRAY_KEYS = new Set<string>([
  "advertiserIds",
  "customerIds",
  "adAccountIds",
  "accountIds",
] as const);

/**
 * Normalize scoped account IDs across platform-specific formats so JWT scope
 * claims can be compared consistently.
 */
function normalizeScopedId(id: string): string {
  if (id.startsWith("act_")) {
    return id.slice(4);
  }

  const linkedInMatch = /^urn:li:sponsoredAccount:(.+)$/.exec(id);
  if (linkedInMatch) {
    return linkedInMatch[1];
  }

  return id;
}

interface ScopedIdentifier {
  path: string;
  value: string;
}

function collectScopedIdentifiers(value: unknown, path = ""): ScopedIdentifier[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectScopedIdentifiers(item, `${path}[${index}]`));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;

    if (SCOPED_ID_KEYS.has(key)) {
      return typeof nestedValue === "string" ? [{ path: currentPath, value: nestedValue }] : [];
    }

    if (SCOPED_ID_ARRAY_KEYS.has(key)) {
      return Array.isArray(nestedValue)
        ? nestedValue
            .filter((item): item is string => typeof item === "string")
            .map((item) => ({ path: currentPath, value: item }))
        : [];
    }

    if (nestedValue && typeof nestedValue === "object") {
      return collectScopedIdentifiers(nestedValue, currentPath);
    }

    return [];
  });
}

/**
 * MCP text content block — the standard return type for tool response formatters.
 * All responseFormatter functions should return `McpTextContent[]`.
 */
export interface McpTextContent {
  type: "text";
  text: string;
  [key: string]: unknown;
}

/**
 * Request context created per tool invocation
 */
export interface ToolRequestContext {
  requestId: string;
  timestamp: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * SDK context passed to tool logic
 */
export interface ToolSdkContext {
  requestId?: string;
  sessionId?: string;
  elicitInput?: (params: Record<string, unknown>) => Promise<unknown>;
  sendLoggingMessage?: (params: {
    level: string;
    logger?: string;
    data?: unknown;
  }) => Promise<void>;
  /**
   * Idempotency key for governed writes — the verified decision token's `jti`.
   * Present only on verified governed write calls; populated and covered by
   * `tool-handler-factory-governance.test.ts`.
   *
   * NO TOOL CURRENTLY READS IT. This docstring used to claim "tool logic
   * forwards it to the platform API where an idempotency key is supported",
   * which described behaviour that does not exist anywhere in the fleet (sweep
   * 2026-07-25, 05-F4; documented-claim #9). It is corrected rather than
   * implemented, because the missing piece is not wiring:
   *
   * No platform client in this repo has a client-supplied idempotency mechanism
   * to forward it TO. The `request_id` fields on the Snapchat and TikTok clients
   * are response correlation ids, not request keys. Adding a reader would mean
   * inventing a header the platform ignores, which is worse than the honest gap
   * — it would read as protection that isn't there, which is the exact failure
   * mode this comment had.
   *
   * What actually protects a money-moving write from duplication today is the
   * METHOD-level retry exclusion in `retryable-fetch.ts`: a POST is not retried
   * on an ambiguous 5xx, so no ambiguous re-send happens for a key to
   * deduplicate. That is a narrower guarantee than an idempotency key — it does
   * nothing about a duplicate initiated ABOVE the HTTP client (an Inngest step
   * retry, a re-delivered execute trigger) — and the governance layer's own
   * consume-once `jti` store is what covers that rail.
   *
   * Residual, unfixed and worth naming: `bulk-executor.ts` has no per-item key
   * and no checkpoint, so a partially-completed bulk write cannot be resumed
   * without re-issuing the items that already succeeded. Keep this field when a
   * platform does gain an idempotency header — the value is the right one.
   */
  idempotencyKey?: string;
  [key: string]: unknown;
}

/**
 * A concrete input example for a tool. Not forwarded to MCP clients via
 * the SDK (which has no inputExamples field). Instead, consumed by:
 *  - `createToolExamplesResource()` to generate on-demand MCP Resources
 *  - The cesteral-intelligence frontend for Anthropic API `input_examples`
 */
export interface ToolInputExample {
  /** Short label describing the scenario, e.g. "Create a TTD campaign" */
  label: string;
  /** Complete input payload — must validate against the tool's inputSchema */
  input: Record<string, unknown>;
}

/**
 * Format ToolInputExample[] into a markdown section appended to tool descriptions.
 * Returns empty string when examples is undefined or empty.
 */
export function formatExamplesForDescription(examples?: ToolInputExample[]): string {
  if (!examples || examples.length === 0) return "";

  const blocks = examples.map(
    (ex) => `**${ex.label}:**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``
  );

  return `\n\n### Examples\n\n${blocks.join("\n\n")}`;
}

/**
 * Tool annotations per MCP Spec 2025-11-25
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolInteractionContext {
  toolName: string;
  operation: string;
  workflowId?: string;
  platform?: string;
  packageName?: string;
  requestId: string;
}

/**
 * Minimal tool definition interface — matches all server packages.
 * Includes all fields from MCP Spec 2025-11-25 (title, annotations, outputSchema).
 */
export interface ToolDefinitionForFactory {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  /**
   * Input examples for this tool. Not forwarded to the MCP SDK during registration.
   * Consumed by `createToolExamplesResource()` for on-demand MCP Resources and
   * by the cesteral-intelligence frontend for Anthropic API `input_examples`.
   */
  inputExamples?: ToolInputExample[];
  logic: (input: any, context: any, sdkContext?: any) => Promise<any>;
  responseFormatter?: (result: any, input: any) => McpTextContent[];
}

/**
 * Tool registration config passed to McpServer.registerTool().
 * Matches the MCP SDK's expected config shape including 2025-11-25 fields.
 */
interface ToolRegistrationConfig {
  title?: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: ToolAnnotations;
}

/**
 * Structural type for McpServer — avoids direct dependency on @modelcontextprotocol/sdk.
 * Uses `any` for the elicitInput param to accommodate SDK's specific union type.
 */
interface McpServerLike {
  server: {
    elicitInput: (params: any) => Promise<any>;
    getClientCapabilities?: () => { elicitation?: unknown } | undefined;
  };
  sendLoggingMessage(params: { level: string; logger?: string; data?: unknown }): Promise<void>;
  registerTool(
    name: string,
    config: ToolRegistrationConfig,
    handler: (args: any) => Promise<any>
  ): void;
}

/**
 * Options for registerToolsFromDefinitions
 */
export interface RegisterToolsOptions {
  server: McpServerLike;
  tools: ToolDefinitionForFactory[];
  logger: Logger;
  sessionId?: string;
  /**
   * Transform a Zod schema into the format expected by server.registerTool().
   * dbm-mcp converts to JSON Schema; dv360-mcp extracts the raw Zod shape.
   */
  transformSchema: (schema: z.ZodTypeAny) => unknown;
  /**
   * Create a request context per tool invocation.
   * Injected so each server can use its own internal request-context module.
   */
  createRequestContext: (params: {
    operation: string;
    additionalContext: Record<string, unknown>;
  }) => ToolRequestContext;
  /**
   * Controls JSON formatting for default text responses when no custom responseFormatter is provided.
   * `compact` reduces token usage and is recommended when outputSchema is present.
   */
  defaultTextFormat?: "compact" | "pretty";
  platform?: string;
  packageName?: string;
  /**
   * Optional workflow id map to annotate executions by tool name.
   */
  workflowIdByToolName?: Record<string, string>;
  /**
   * Optional interaction logger for persisting tool execution data to JSONL.
   * Writes are fire-and-forget.
   */
  interactionLogger?: InteractionLogger;
  /**
   * Optional resolver to access session auth context for authorization + audit logging.
   */
  authContextResolver?: () => SessionAuthContext | undefined;
  /**
   * Maximum character length for text content blocks in tool responses.
   * Text blocks exceeding this limit are truncated with a diagnostic message.
   * Defaults to RESPONSE_CHARACTER_LIMIT (25,000).
   */
  responseCharacterLimit?: number;
  /**
   * Decision-token replay store. Defaults to a shared in-memory store (correct
   * for stdio / single-instance). On multi-instance Cloud Run with enforcement,
   * inject a distributed store via `selectJtiStore`.
   */
  jtiStore?: JtiStore;
  /** jti TTL in ms (≥ token TTL). Defaults to 600_000. */
  jtiTtlMs?: number;
  /**
   * Resolves a governed tool's published `definitionHash` (from the attested
   * `cesteral-manifest.json`) by tool name — the same value governance puts in
   * the token. Without it, the definition-hash binding cannot be verified:
   * `warn` logs the gap and proceeds; `enforce` fails closed.
   */
  resolveDefinitionHash?: (toolName: string) => string | undefined;
  /**
   * Env source for decision-token mode + secrets. Defaults to `process.env`;
   * injectable for tests.
   */
  governanceEnv?: Record<string, string | undefined>;
}

function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
  } catch {
    return 0;
  }
}

/**
 * Truncate text content blocks that exceed the character limit.
 * Non-text content blocks (e.g. image, resource) are passed through unchanged.
 *
 * @returns A new content array with oversized text blocks truncated and a
 *          diagnostic message appended indicating how much was omitted.
 */
export function truncateTextContent(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
  limit: number
): Array<{ type: string; text?: string; [key: string]: unknown }> {
  return content.map((block) => {
    if (block.type !== "text" || typeof block.text !== "string") {
      return block;
    }
    if (block.text.length <= limit) {
      return block;
    }

    const originalLength = block.text.length;
    const truncatedText =
      block.text.slice(0, limit) +
      `\n\n--- Response truncated (${limit.toLocaleString("en-US")} of ${originalLength.toLocaleString("en-US")} characters shown). Use pagination parameters or filters to narrow results. ---`;

    return { ...block, text: truncatedText };
  });
}

/**
 * Register all tools on an McpServer with standardized handling.
 *
 * This eliminates ~90 lines of duplicated boilerplate per server by
 * centralising: OTEL spans, input validation, context creation,
 * elicitation wiring, response formatting, error handling, and metrics.
 *
 * MCP Spec 2025-11-25 compliance:
 * - Forwards title, annotations, outputSchema to the SDK
 * - Returns structuredContent alongside content when outputSchema is defined
 */
export function registerToolsFromDefinitions(opts: RegisterToolsOptions): void {
  const {
    server,
    tools,
    logger,
    sessionId,
    transformSchema,
    createRequestContext,
    defaultTextFormat = "compact",
    platform,
    packageName,
    workflowIdByToolName = {},
    interactionLogger,
    authContextResolver,
    responseCharacterLimit = RESPONSE_CHARACTER_LIMIT,
    resolveDefinitionHash,
  } = opts;

  if (!Number.isFinite(responseCharacterLimit) || responseCharacterLimit < 1) {
    throw new Error(
      `responseCharacterLimit must be a positive finite number, got ${responseCharacterLimit}`
    );
  }

  const auditLogger = logger.child({ component: "audit" });
  const governanceEnv = opts.governanceEnv ?? process.env;
  const jtiStore = resolveJtiStore(opts.jtiStore);
  const jtiTtlMs = opts.jtiTtlMs ?? DEFAULT_JTI_TTL_MS;

  // Deployment footgun guard (review P3): if any governed write resolves to
  // `enforce` while the jti store in use gives no CROSS-PROCESS consume-once
  // guarantee, replay protection silently fails to hold across Cloud Run
  // instances. On a hosted deployment (or when the env declares firestore but it
  // was never wired) this is a fail-closed BOOT error — an enforce posture that
  // could double-execute a money-moving write must not start. Stdio / self-host
  // keeps the warn (in-memory is correct there).
  //
  // The signal is the store's own `distributed` declaration, not whether one was
  // injected. `Boolean(opts.jtiStore)` treated ANY injected store as safe, so
  // wiring `selectJtiStore(...)` without `GOVERNANCE_JTI_STORE=firestore` — half
  // of the documented remediation — produced silence instead of the throw the
  // unwired case correctly gets (sweep 2026-07-25, 10-F1).
  {
    const anyEnforce = tools.some((t) => {
      const c = (t.annotations as { cesteral?: CesteralToolAnnotations } | undefined)?.cesteral;
      return (
        c?.kind === "write" &&
        resolveTokenMode({ contractId: c.contractId, env: governanceEnv }) === "enforce"
      );
    });
    const safety = evaluateJtiStoreEnforcementSafety({
      anyEnforce,
      storeDistributed: jtiStore.distributed === true,
      env: governanceEnv,
    });
    if (safety.action === "throw") {
      throw new Error(`Governance jti-store misconfiguration: ${safety.reason}`);
    }
    if (safety.action === "warn") {
      logger.warn({ component: "governance", jtiStore: "non-distributed" }, safety.reason);
    }
  }

  // Fail-open visibility guard (issue #102): governance defaults to `off`, so a
  // deploy that never sets a GOVERNANCE_TOKEN_MODE* tier ships every governed
  // write ungoverned while the manifest still advertises the tools as governed.
  // The default is intentional for staged rollout, but it must not be silent —
  // surface a single registration-time summary so an operator can see at boot
  // exactly how many governed writes are actually gated vs. running fail-open.
  {
    const governedWrites = tools.filter((t) => {
      const c = (t.annotations as { cesteral?: CesteralToolAnnotations } | undefined)?.cesteral;
      return c?.kind === "write";
    });
    if (governedWrites.length > 0) {
      const offCount = governedWrites.filter((t) => {
        const c = (t.annotations as { cesteral?: CesteralToolAnnotations } | undefined)?.cesteral;
        return c && resolveTokenMode({ contractId: c.contractId, env: governanceEnv }) === "off";
      }).length;
      const summary = {
        component: "governance",
        event: "token_mode_summary",
        governedWrites: governedWrites.length,
        ungoverned: offCount,
        gated: governedWrites.length - offCount,
      };
      if (offCount === governedWrites.length) {
        logger.warn(
          summary,
          `Governance fail-open: all ${governedWrites.length} governed write tool(s) resolve to ` +
            `token mode 'off' — no decision-token verification will run. Set a ` +
            `GOVERNANCE_TOKEN_MODE* tier (global, per-server, or per-contract) before go-live.`
        );
      } else {
        logger.info(
          summary,
          `Governance token modes resolved: ${summary.gated}/${governedWrites.length} ` +
            `governed write tool(s) gated, ${offCount} running 'off'.`
        );
      }
    }
  }

  for (const tool of tools) {
    // Build registration config with all MCP 2025-11-25 fields
    const transformedInputSchema = transformSchema(tool.inputSchema);

    const toolConfig: ToolRegistrationConfig = {
      description: tool.description,
      inputSchema: transformedInputSchema,
    };

    // Forward optional title (human-readable display name)
    if (tool.title) {
      toolConfig.title = tool.title;
    }

    // Forward optional annotations (readOnlyHint, destructiveHint, etc.)
    if (tool.annotations) {
      toolConfig.annotations = tool.annotations;
    }

    // Forward optional outputSchema for structured content validation
    let transformedOutputSchema: unknown;
    if (tool.outputSchema) {
      transformedOutputSchema = transformSchema(tool.outputSchema);
      toolConfig.outputSchema = transformedOutputSchema;
    }

    const schemaSizeLog: Record<string, unknown> = {
      toolName: tool.name,
      inputSchemaBytes: estimatePayloadBytes(transformedInputSchema),
    };
    if (transformedOutputSchema !== undefined) {
      schemaSizeLog.outputSchemaBytes = estimatePayloadBytes(transformedOutputSchema);
    }
    logger.debug(schemaSizeLog, "Tool schema sizes");

    server.registerTool(tool.name, toolConfig, async (args: unknown) => {
      logger.info({ toolName: tool.name, arguments: sanitizeParams(args) }, "Handling tool call");

      // Send MCP logging notification for tool invocation
      server
        .sendLoggingMessage({
          level: "info",
          logger: tool.name,
          data: `Invoking tool: ${tool.name}`,
        })
        .catch(() => {
          /* ignore if no client connected */
        });

      const startTime = Date.now();

      return withToolSpan(tool.name, (args as Record<string, unknown>) || {}, async () => {
        let requestId: string | undefined;
        let resolvedAuthContext: SessionAuthContext | undefined;
        let auditedIdentifiers: Record<string, string | string[]> = {};

        // ALS ownership boundary:
        //   - Transport layer MAY install a request-scoped context
        //     (HTTP transport does; stdio transport does not).
        //   - Tool handler OWNS the per-invocation context used by the
        //     upstream recorder. We always install one here so:
        //       1. stdio tool calls have a store (otherwise
        //          `recordUpstreamRequest()` no-ops and the failure trail
        //          is always empty).
        //       2. Successive tool invocations within the same HTTP
        //          request don't share recorder state across calls.
        //   Do not "simplify" this to rely solely on transport ALS —
        //   stdio has no transport ALS at all.
        const parent = getRequestContext();
        const toolAlsContext: RequestContext = {
          requestId:
            parent?.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          timestamp: new Date().toISOString(),
          sessionId: sessionId ?? parent?.sessionId,
          operation: `tool:${tool.name}`,
          ...(parent ?? {}),
          // Always start with an empty recorder array so this tool call
          // sees only its own upstream attempts.
          upstreamRequests: [],
        };

        return runWithRequestContext(toolAlsContext, async () => {
          try {
            const context = createRequestContext({
              operation: `HandleToolRequest:${tool.name}`,
              additionalContext: {
                toolName: tool.name,
                input: args,
              },
            });
            requestId = context.requestId;

            const validatedInput = tool.inputSchema.parse(args);
            setSpanAttribute("tool.input.validated", true);

            // ── Authorization check ──────────────────────────────────────
            if (authContextResolver) {
              resolvedAuthContext = authContextResolver();
              if (resolvedAuthContext && resolvedAuthContext.allowedAdvertisers !== undefined) {
                const input = validatedInput as Record<string, unknown>;
                const allowedAdvertisers =
                  resolvedAuthContext.allowedAdvertisers.map(normalizeScopedId);
                const scopedIdentifiers = collectScopedIdentifiers(input);

                for (const identifier of scopedIdentifiers) {
                  const path = identifier.path;
                  const value = identifier.value;

                  if (auditedIdentifiers[path]) {
                    const existing = auditedIdentifiers[path];
                    auditedIdentifiers[path] = Array.isArray(existing)
                      ? [...existing, value]
                      : [existing, value];
                  } else {
                    auditedIdentifiers[path] = value;
                  }

                  if (!allowedAdvertisers.includes(normalizeScopedId(value))) {
                    auditLogger.warn(
                      {
                        event: "tool_access_denied",
                        sessionId,
                        clientId: resolvedAuthContext.authInfo.clientId,
                        authType: resolvedAuthContext.authInfo.authType,
                        tool: tool.name,
                        scopedField: path,
                        scopedValue: value,
                        authorized: false,
                        reason: "advertiser not in allowed scope",
                      },
                      "Authorization denied"
                    );

                    recordToolExecution(tool.name, "error", Date.now() - startTime);

                    return {
                      content: [
                        {
                          type: "text" as const,
                          text: `Access denied: ${path} "${value}" is not in your authorized scope.`,
                        },
                      ],
                      isError: true,
                    };
                  }
                }
              }
            }

            // ── Governance decision-token verification (governed writes) ──
            // Runs AFTER advertiser-scope authz (above) so an unauthorized call
            // never reaches jti consumption, and BEFORE tool.logic so an
            // enforced rejection prevents the mutation. Gated to cesteral write
            // annotations; global default mode is `off` (no behavior change).
            let idempotencyKey: string | undefined;
            const cesteralAnnotation = (
              tool.annotations as { cesteral?: CesteralToolAnnotations } | undefined
            )?.cesteral;
            if (cesteralAnnotation?.kind === "write") {
              const configuredMode = resolveTokenMode({
                contractId: cesteralAnnotation.contractId,
                env: governanceEnv,
              });
              // Effect-class writes are now token-governed identically to
              // entity-class writes. The governance control plane mints a live
              // decision token for admitted effect writes (Phase 2), so they
              // flow through the exact same verify path below — there is no
              // effect-specific fork. The only effect-specific note is that
              // effect writes have no read-partner/snapshot, which is
              // irrelevant to token verification (verify is writeClass-agnostic).
              //
              // Behaviour by configured mode (the operator's explicit intent):
              //  - `off`     → no-op (read-only behaviour preserved; global default).
              //  - `warn`    → verify + log the verdict; never block.
              //  - `enforce` → block on a bad verdict or an unresolved
              //                definition hash; on ok, expose jti as
              //                idempotencyKey.
              const mode = configuredMode;
              if (mode !== "off") {
                const expectedDefinitionHash = resolveDefinitionHash?.(tool.name);
                // Under enforce, an unresolved definition hash means the binding
                // cannot be fully verified — fail closed rather than admit a
                // partially-bound token.
                if (mode === "enforce" && expectedDefinitionHash === undefined) {
                  logger.warn(
                    {
                      component: "governance-audit",
                      event: "decision_token_verification",
                      status: "rejected",
                      reasonCode: "DEFINITION_HASH_UNRESOLVED",
                      mode,
                      contractId: cesteralAnnotation.contractId,
                      toolName: tool.name,
                    },
                    "decision token: definition hash unresolved under enforce (no manifest resolver)"
                  );
                  recordToolExecution(tool.name, "error", Date.now() - startTime);
                  throw new McpError(
                    JsonRpcErrorCode.Unauthorized,
                    `Governance: cannot verify decision token for ${tool.name} ` +
                      `(definition hash unavailable)`
                  );
                }

                // Warn (or enforce with a resolver): verify every binding. When
                // the definition hash is unresolved (warn only), it is passed as
                // undefined so the OTHER bindings — signature, claims, expiry,
                // issuer/audience, actionHash, replay — all still run, and the
                // verdict reports definitionHashVerified:false.
                // KNOWN DIVERGENCE (sweep 2026-07-25, 10-F2 — confirmed, not
                // yet fixed). `canonicalizeExecutableArgs` is contracted to
                // operate on the RAW wire shape, and the minter honours that.
                // `args` here are POST-Zod-parse: the MCP SDK validates against
                // the tool's `inputSchema` before invoking this handler, so any
                // key with a `.default()` is materialized before the hash sees
                // it. The two sides then hash different objects and the call is
                // rejected as `action_hash_mismatch` under `enforce`.
                //
                // Affects governed writes with a non-`dry_run` default —
                // notably sa360's `insert_conversions` / `update_conversions`
                // (`segmentationType`), which per CLAUDE.md are sa360's ONLY
                // governed writes. `dry_run` defaults are unaffected because
                // `executableArgsExclude` drops them, which is why most tools
                // are fine and why this went unnoticed.
                //
                // Not fixed here: the correction belongs in the canonicalization
                // contract that BOTH repos consume as a pinned published
                // `@cesteral/contract-hash`, which is blocked on the same
                // publication issue as C3 / 03-F1. Stripping defaulted keys in
                // this repo alone was rejected — a client explicitly sending a
                // value equal to the default is indistinguishable from one
                // omitting it, so that would drop a real argument from a
                // security binding.
                //
                // Pinned by `tests/governance/action-hash-parsed-args.test.ts`,
                // which drives a real McpServer (the governance suite's mock
                // server calls handlers with raw args and so cannot see this).
                const executableArgs = canonicalizeExecutableArgs({
                  rawArgs: args,
                  // `executableArgsExclude` is required by the authoring type but
                  // OPTIONAL in the (deliberately loose) release Zod schema, so a
                  // tool minted before the field existed can reach here undefined.
                  // `canonicalizeExecutableArgs` calls `exclude.includes(...)` and
                  // would throw on undefined — defaulting to `[]` keeps a verify
                  // (even under warn) from crashing the write instead of verifying.
                  exclude: cesteralAnnotation.executableArgsExclude ?? [],
                });
                const verdict = await verifyDecisionToken({
                  token: getRequestContext()?.decisionToken,
                  secrets: {
                    current: governanceEnv.GOVERNANCE_DECISION_TOKEN_SECRET ?? "",
                    previous: governanceEnv.GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS,
                  },
                  expected: {
                    contractId: cesteralAnnotation.contractId,
                    definitionHash: expectedDefinitionHash,
                    actionHash: hashActionInput(executableArgs),
                  },
                  jtiStore,
                  jtiTtlMs,
                });
                logDecisionTokenVerdict(logger, {
                  verdict,
                  mode,
                  contractId: cesteralAnnotation.contractId,
                  toolName: tool.name,
                });
                if (mode === "enforce" && !verdict.ok) {
                  recordToolExecution(tool.name, "error", Date.now() - startTime);
                  throw new McpError(
                    JsonRpcErrorCode.Unauthorized,
                    `Governance decision token rejected: ${verdict.reasonCode}`
                  );
                }
                if (verdict.ok && verdict.claims?.jti) {
                  idempotencyKey = verdict.claims.jti;
                }
              }
            }

            // Only expose elicitInput when the connected client advertises the
            // elicitation capability. Gating here means the `!sdkContext.elicitInput`
            // fallback in shared elicitation-helpers triggers cleanly for stdio /
            // unsupported clients, instead of the SDK rejecting downstream.
            const clientSupportsElicitation = Boolean(
              server.server.getClientCapabilities?.()?.elicitation
            );

            const sdkContext: ToolSdkContext = {
              requestId: context.requestId,
              sessionId,
              elicitInput: clientSupportsElicitation
                ? async (params) => {
                    return server.server.elicitInput(params);
                  }
                : undefined,
              sendLoggingMessage: async (params) => {
                return server.sendLoggingMessage(params);
              },
              idempotencyKey,
            };
            const interactionContext: ToolInteractionContext = {
              toolName: tool.name,
              operation: `tool:${tool.name}`,
              workflowId: workflowIdByToolName[tool.name],
              platform,
              packageName,
              requestId: context.requestId,
            };
            if (platform) setSpanAttribute("mcp.platform", platform);
            if (packageName) setSpanAttribute("mcp.server.package", packageName);
            if (interactionContext.workflowId) {
              setSpanAttribute("mcp.workflow.id", interactionContext.workflowId);
            }

            const result = await tool.logic(validatedInput, context, sdkContext);
            setSpanAttribute("mcp.tool.execution.success", true);

            const durationMs = Date.now() - startTime;
            setSpanAttribute("mcp.tool.execution.latency_ms", durationMs);

            // ── Interaction logging (fire-and-forget) ────────────────────
            if (interactionLogger) {
              const logEntry: InteractionLogEntry = {
                type: "tool_call",
                ts: new Date().toISOString(),
                sessionId: sessionId ?? "unknown",
                tool: tool.name,
                params: sanitizeParams(args) as Record<string, unknown>,
                success: true,
                durationMs,
                workflowId: interactionContext.workflowId,
                platform,
                packageName,
                requestId: context.requestId,
              };
              interactionLogger.append(logEntry);
            }

            const rawContent = tool.responseFormatter
              ? tool.responseFormatter(result, validatedInput)
              : [
                  {
                    type: "text" as const,
                    text:
                      defaultTextFormat === "pretty"
                        ? JSON.stringify(result, null, 2)
                        : JSON.stringify(result),
                  },
                ];

            // Truncate oversized text content blocks to prevent context window overflow
            const content = truncateTextContent(rawContent, responseCharacterLimit);

            if (content.some((block, i) => block !== rawContent[i])) {
              logger.warn(
                {
                  toolName: tool.name,
                  requestId: context.requestId,
                  limit: responseCharacterLimit,
                },
                "Tool response text truncated"
              );
            }

            if (tool.outputSchema && tool.responseFormatter) {
              const hasVerbosePayloadText = content.some(
                (item) =>
                  item?.type === "text" &&
                  typeof item.text === "string" &&
                  (item.text.includes("Full Data:") || item.text.length > 6_000)
              );
              if (hasVerbosePayloadText) {
                logger.warn(
                  { toolName: tool.name },
                  "Structured tool response text appears verbose; prefer concise summaries with structuredContent"
                );
              }
            }

            logger.info(
              { toolName: tool.name, requestId: context.requestId },
              "Tool executed successfully"
            );

            // Send MCP logging notification for successful completion
            server
              .sendLoggingMessage({
                level: "info",
                logger: tool.name,
                data: `Tool ${tool.name} completed successfully`,
              })
              .catch(() => {
                /* ignore if no client connected */
              });

            if (resolvedAuthContext) {
              auditLogger.info(
                {
                  event: "tool_access",
                  sessionId,
                  clientId: resolvedAuthContext.authInfo.clientId,
                  authType: resolvedAuthContext.authInfo.authType,
                  tool: tool.name,
                  authorized: true,
                  durationMs,
                  success: true,
                  ...auditedIdentifiers,
                },
                "Tool access"
              );
            }

            recordToolExecution(tool.name, "success", Date.now() - startTime);

            // MCP Spec 2025-11-25: return structuredContent alongside content
            // when outputSchema is defined. This enables typed result parsing.
            if (tool.outputSchema) {
              return {
                content,
                structuredContent: result,
              };
            }

            return { content };
          } catch (error) {
            recordSpanError(error as Error);
            setSpanAttribute("mcp.tool.execution.success", false);
            if (error instanceof McpError) {
              setSpanAttribute("mcp.tool.error_class", error.code);
            }

            recordToolExecution(tool.name, "error", Date.now() - startTime);

            if (resolvedAuthContext) {
              auditLogger.info(
                {
                  event: "tool_access",
                  sessionId,
                  clientId: resolvedAuthContext.authInfo.clientId,
                  authType: resolvedAuthContext.authInfo.authType,
                  tool: tool.name,
                  authorized: true,
                  durationMs: Date.now() - startTime,
                  success: false,
                  ...auditedIdentifiers,
                },
                "Tool access (error)"
              );
            }

            const mcpError = ErrorHandler.handleError(
              error,
              { operation: `tool:${tool.name}`, input: args },
              logger
            );

            // Log structured failure: params + error + captured upstream
            // HTTP trail so analysts can diagnose why the platform rejected
            // the call without replaying it.
            if (interactionLogger) {
              const upstream = getRecordedUpstreamRequests();
              interactionLogger.logFailure({
                ts: new Date().toISOString(),
                sessionId: sessionId ?? "unknown",
                tool: tool.name,
                params: sanitizeParams(args) as Record<string, unknown>,
                durationMs: Date.now() - startTime,
                workflowId: workflowIdByToolName[tool.name],
                platform,
                packageName,
                requestId,
                errorCode: mcpError.code,
                errorMessage: mcpError.message,
                errorData: ErrorHandler.sanitizeErrorData(mcpError.data),
                upstream: upstream.length > 0 ? upstream : undefined,
              });
            }

            // Send MCP logging notification for tool failure
            server
              .sendLoggingMessage({
                level: "error",
                logger: tool.name,
                // `mcpError.message`, not `(error as Error).message` (#741 H-2).
                // The raw error is whatever was thrown — for an upstream failure
                // its message embeds the platform's response body — and this
                // notification goes to the connected client. `mcpError` has been
                // through the McpError constructor's redaction; the original has
                // not. The error payload below already used `mcpError`; this was
                // the one sink still reading around it.
                data: `Tool ${tool.name} failed: ${mcpError.message}`,
              })
              .catch(() => {
                /* ignore if no client connected */
              });

            const sanitizedData = ErrorHandler.sanitizeErrorData(mcpError.data);

            // Stack traces are written to server-side logs only (see ErrorHandler.handleError).
            // Never send them to the client — they leak local filesystem paths and internals.
            const errorPayload: Record<string, unknown> = {
              error: mcpError.message,
              code: mcpError.code,
              data: sanitizedData ?? null,
            };

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(errorPayload),
                },
              ],
              isError: true,
            };
          }
        }); // end runWithRequestContext(toolAlsContext)
      });
    });
  }

  logger.info({ toolCount: tools.length }, "Registered MCP tools");
}
