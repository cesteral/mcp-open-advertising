// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Process-level governance runtime — resolves the decision-token jti store ONCE
 * per process and validates the resulting enforcement posture at startup.
 *
 * Why this module exists (issue #166):
 *
 * The enforce-mode safety guard was correct but unreachable and mistimed.
 *
 *   1. **Unreachable.** No server package injected a `jtiStore` or called
 *      `selectJtiStore`, so `registerToolsFromDefinitions` always fell back to
 *      the in-memory store. `FirestoreJtiStore` was dead code outside shared's
 *      own tests, which left hosted `enforce` deployable only via
 *      `GOVERNANCE_ALLOW_INMEMORY_JTI_UNDER_ENFORCE=true` — the opt-out that
 *      reintroduces precisely the cross-instance replay window enforce exists to
 *      close (a replayed decision token routed to a second Cloud Run instance is
 *      accepted as fresh → a double-executed money-moving write).
 *
 *   2. **Mistimed.** The guard ran inside `registerToolsFromDefinitions`, which
 *      the streamable-HTTP transport invokes once per SESSION, not once per
 *      process. A misconfigured enforce deploy therefore started cleanly, passed
 *      its health check, went green — and then threw on every session
 *      establishment, reads included. A total outage wearing the costume of a
 *      runtime fault, when it should have been a boot refusal.
 *
 * `bootstrapMcpServer` calls {@link initializeGovernanceRuntime} before starting
 * either transport, so a misconfiguration kills the process before it can take
 * traffic. The store it resolves is published to
 * {@link getGovernanceJtiStore} for the tool factory to pick up.
 */

import { resolveTokenMode } from "./config.js";
import { selectJtiStore, type FirestoreLike, type JtiStore } from "./jti-store.js";
import type { CesteralToolAnnotations } from "../types/cesteral-annotations.js";

/**
 * Minimal tool shape needed to decide whether anything enforces.
 *
 * `annotations` is `unknown` rather than a structural literal so this accepts
 * the MCP SDK's `ToolAnnotations` (which each server's `allTools` carries)
 * without shared having to import the SDK — shared deliberately cannot depend on
 * `@modelcontextprotocol/sdk`. The narrowing happens at the read below.
 */
interface ToolLike {
  annotations?: unknown;
}

interface GovernanceLogger {
  warn: (obj: unknown, msg?: string) => void;
  info?: (obj: unknown, msg?: string) => void;
}

/**
 * Whether ANY governed write in `tools` resolves to token mode `enforce` under
 * `env`. Reads are excluded: only writes carry a decision token, so only a write
 * can be replayed.
 *
 * Shared with `registerToolsFromDefinitions` so the boot check and the
 * registration check can never disagree about what "enforcing" means.
 */
export function hasEnforcedWrite(
  tools: readonly ToolLike[],
  env: Record<string, string | undefined>
): boolean {
  return tools.some((tool) => {
    const cesteral = (tool.annotations as { cesteral?: CesteralToolAnnotations } | undefined)
      ?.cesteral;
    return (
      cesteral?.kind === "write" &&
      resolveTokenMode({ contractId: cesteral.contractId, env }) === "enforce"
    );
  });
}

/**
 * Same decision table as the registration-time guard, kept here so the boot path
 * does not import from the tool factory (which would be a cycle). The factory
 * re-runs its own check as defense in depth; with the store wired, it passes.
 */
function evaluatePosture(params: {
  anyEnforce: boolean;
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
    return {
      action: allowInMemory ? "warn" : "throw",
      reason:
        "GOVERNANCE_JTI_STORE=firestore is set but the resolved jti store is not distributed — " +
        "the Firestore client failed to load, or an injected store does not declare " +
        "`distributed = true`. Enforce-mode replay protection is not active.",
    };
  }

  if (hosted) {
    return {
      action: allowInMemory ? "warn" : "throw",
      reason:
        "Decision-token enforcement is active on a hosted (Cloud Run) deployment with a " +
        "non-distributed jti store — replay protection does not hold across instances. Set " +
        "GOVERNANCE_JTI_STORE=firestore.",
    };
  }

  return {
    action: "warn",
    reason:
      "Decision-token enforcement is enabled with a non-distributed jti store — replay " +
      "protection does not hold across multiple instances. Set GOVERNANCE_JTI_STORE=firestore " +
      "before scaling out.",
  };
}

/** Resolved once per process; `undefined` until `initializeGovernanceRuntime` runs. */
let resolvedStore: JtiStore | undefined;
let inFlight: Promise<JtiStore> | undefined;

/**
 * Resolve the jti store for this process and validate the enforcement posture.
 *
 * Throws when the posture is unsafe, which — called from `bootstrapMcpServer` —
 * aborts startup before the process serves anything. That is the intent behind
 * CLAUDE.md principle 6's "must not start".
 *
 * Idempotent: repeated calls return the same store instance without re-resolving.
 */
export async function initializeGovernanceRuntime(opts: {
  tools: readonly ToolLike[];
  logger: GovernanceLogger;
  env?: Record<string, string | undefined>;
  /** Test seam for the Firestore client. */
  firestoreFactory?: () => Promise<FirestoreLike>;
  /** Test seam: force the resolved store, bypassing `selectJtiStore`. */
  storeOverride?: JtiStore;
}): Promise<JtiStore> {
  if (resolvedStore) return resolvedStore;
  if (inFlight) return inFlight;

  const env = opts.env ?? process.env;
  const anyEnforce = hasEnforcedWrite(opts.tools, env);

  inFlight = (async () => {
    const store =
      opts.storeOverride ??
      (await selectJtiStore({
        env,
        enforcementEnabled: anyEnforce,
        logger: opts.logger,
        firestoreFactory: opts.firestoreFactory,
      }));

    const posture = evaluatePosture({
      anyEnforce,
      storeDistributed: store.distributed === true,
      env,
    });

    if (posture.action === "throw") {
      throw new Error(`Governance jti-store misconfiguration: ${posture.reason}`);
    }
    if (posture.action === "warn") {
      opts.logger.warn(
        { component: "governance", event: "jti_store_posture", jtiStore: "non-distributed" },
        posture.reason
      );
    }

    opts.logger.info?.(
      {
        component: "governance",
        event: "jti_store_resolved",
        distributed: store.distributed === true,
        enforcing: anyEnforce,
      },
      "Governance jti store resolved"
    );

    resolvedStore = store;
    return store;
  })();

  try {
    return await inFlight;
  } finally {
    // Clear the latch either way: on success `resolvedStore` short-circuits
    // future calls, and on failure a retry must be able to re-resolve rather
    // than replaying a rejected promise forever.
    inFlight = undefined;
  }
}

/**
 * The process-wide jti store, or `undefined` if the runtime was never
 * initialized (stdio one-offs, tests, direct `registerToolsFromDefinitions`
 * callers). Undefined is a valid answer — the factory falls back to its own
 * in-memory store and re-runs the safety guard.
 */
export function getGovernanceJtiStore(): JtiStore | undefined {
  return resolvedStore;
}

/** Test-only: drop the memoized store so each case starts from a clean process. */
export function resetGovernanceRuntimeForTests(): void {
  resolvedStore = undefined;
  inFlight = undefined;
}
