// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * elicitation-helpers — shared MCP elicitation patterns for destructive write paths.
 *
 * Provides a small family of named confirmation helpers that all funnel through
 * a single internal `confirmDestructive` so message shape, decline handling,
 * and the `MCP_ELICIT_DESTRUCTIVE` env knob stay uniform across servers.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("elicitation-helpers");

/** Minimal duck-typed interface for sdkContext — avoids importing from MCP SDK. */
export interface ElicitContext {
  elicitInput?: (opts: Record<string, unknown>) => Promise<unknown>;
}

interface ElicitInputResult {
  action: string;
  content?: Record<string, unknown>;
}

/**
 * Default bulk threshold: bulk mutations under this count skip elicitation
 * unless they touch a sensitive field (status / budget / bid). Chosen to keep
 * everyday small-batch operator fixes friction-free while still gating
 * meaningful blast radius.
 */
const DEFAULT_BULK_THRESHOLD = 10;

/**
 * Field-name patterns that indicate a bulk mutation is touching spend-impacting
 * or lifecycle-altering fields. The exact spelling differs by platform
 * (entityStatus, dailyBudget, daily_budget, cpcBid, bidAmount, bid_amount, …)
 * so this matches case-insensitively on substrings rather than exact keys.
 *
 * The pattern is intentionally permissive — false positives only cost the user
 * one extra confirmation, while false negatives let spend changes through
 * without gating.
 */
const SENSITIVE_FIELD_PATTERN = /(status|archived|active|budget|bid|cpc|cpm|spend|cap|pacing)/i;

/**
 * Scan an array of payload objects and return `true` if any payload contains a
 * key matching {@link SENSITIVE_FIELD_PATTERN}. Used by tools that wrap
 * {@link elicitBulkMutationConfirmation} to decide whether to gate
 * sub-threshold mutations.
 *
 * Pass the inner mutation payloads (e.g. `input.items.map(i => i.data)`), not
 * the wrapping request object — the wrapper usually contains parent IDs
 * (advertiserId, profileId) that should not trigger the heuristic.
 */
export function hasSensitiveBulkField(
  payloads: ReadonlyArray<Record<string, unknown> | undefined> | undefined
): boolean {
  if (!payloads) return false;
  for (const payload of payloads) {
    if (!payload) continue;
    for (const key of Object.keys(payload)) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) return true;
    }
  }
  return false;
}

const ELICIT_ENV_VAR = "MCP_ELICIT_DESTRUCTIVE";

type ElicitMode = "require" | "skip";

let cachedElicitMode: ElicitMode | undefined;

/**
 * Read MCP_ELICIT_DESTRUCTIVE once. Default `require`. Unknown values fall
 * back to `require` and emit a one-time warning.
 *
 * Test seam: the cache lets tests reset by reassigning `process.env` and
 * calling `__resetElicitModeCache()`.
 */
function readElicitMode(): ElicitMode {
  if (cachedElicitMode !== undefined) return cachedElicitMode;

  const raw = process.env[ELICIT_ENV_VAR];
  if (raw === undefined || raw === "") {
    cachedElicitMode = "require";
    return cachedElicitMode;
  }
  if (raw === "require" || raw === "skip") {
    cachedElicitMode = raw;
    return cachedElicitMode;
  }
  logger.warn(
    { env: ELICIT_ENV_VAR, value: raw },
    `Unknown ${ELICIT_ENV_VAR} value; treating as 'require'. Accepted values: require | skip.`
  );
  cachedElicitMode = "require";
  return cachedElicitMode;
}

/** Test-only: reset the memoized env read so a test can change `process.env` between cases. */
export function __resetElicitModeCache(): void {
  cachedElicitMode = undefined;
}

interface ConfirmDestructiveOpts {
  /** Imperative summary, e.g. "Delete campaign 12345 (Holiday Sale 2025)". */
  action: string;
  /** Why this is risky, in one sentence. Surfaced in the prompt. */
  consequence: string;
  /** Optional impact rows shown to the user (entity IDs/names). Capped at 5. */
  impactPreview?: string[];
  /** Title/description for the confirm checkbox shown by the client. */
  confirmTitle: string;
  confirmDescription: string;
  sdkContext?: ElicitContext;
}

const IMPACT_PREVIEW_CAP = 5;

/**
 * Internal: present a destructive-action confirmation and return whether the
 * user accepted.
 *
 * Returns `true` (allow) when:
 *  - the SDK context has no `elicitInput` (e.g. stdio transport — non-interactive
 *    sessions cannot block), or
 *  - `MCP_ELICIT_DESTRUCTIVE=skip` is set explicitly, or
 *  - the user accepts the elicitation.
 *
 * Returns `false` only when the user actively declines.
 */
async function confirmDestructive(opts: ConfirmDestructiveOpts): Promise<boolean> {
  // Stdio fallback: non-interactive transport cannot prompt — allow.
  if (!opts.sdkContext?.elicitInput) return true;

  // Explicit operator opt-out for automation pipelines.
  if (readElicitMode() === "skip") return true;

  const previewLines =
    opts.impactPreview && opts.impactPreview.length > 0
      ? `\n\nAffected:\n` +
        opts.impactPreview
          .slice(0, IMPACT_PREVIEW_CAP)
          .map((row) => `  • ${row}`)
          .join("\n") +
        (opts.impactPreview.length > IMPACT_PREVIEW_CAP
          ? `\n  • … and ${opts.impactPreview.length - IMPACT_PREVIEW_CAP} more`
          : "")
      : "";

  const message = `${opts.action}\n\n${opts.consequence}${previewLines}`;

  let result: ElicitInputResult;
  try {
    result = (await opts.sdkContext.elicitInput({
      message,
      requestedSchema: {
        type: "object",
        properties: {
          confirm: {
            type: "boolean",
            title: opts.confirmTitle,
            description: opts.confirmDescription,
            default: false,
          },
        },
      },
    })) as ElicitInputResult;
  } catch (err) {
    // The MCP SDK throws when the connected client does not advertise the
    // elicitation capability (e.g. older clients, custom transports). The
    // factory in tool-handler-factory.ts already gates `elicitInput` on the
    // declared client capability, but defend in depth: if the call still
    // rejects with an unsupported-elicitation shape, fall back to the
    // non-interactive contract (allow) instead of blocking the tool.
    // Any other error re-throws so real transport failures surface.
    const errMessage = err instanceof Error ? err.message : String(err);
    if (/does not support .*elicitation|elicitation.*not supported/i.test(errMessage)) {
      logger.warn(
        { error: errMessage },
        "Elicitation unavailable on this client — allowing destructive operation under non-interactive contract."
      );
      return true;
    }
    throw err;
  }

  return result.action === "accept" && result.content?.confirm === true;
}

/**
 * Confirm an archive operation (soft delete that cannot be reactivated on most
 * platforms).
 *
 * Signature preserved for backwards compatibility with existing callers in
 * meta-mcp, linkedin-mcp, tiktok-mcp.
 */
export async function elicitArchiveConfirmation(
  count: number,
  entityLabel: string,
  sdkContext?: ElicitContext
): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to archive ${count} ${entityLabel}(s).`,
    consequence: "This action is irreversible — archived entities cannot be reactivated.",
    confirmTitle: "Confirm archive",
    confirmDescription: `Archive ${count} ${entityLabel}(s) permanently`,
    sdkContext,
  });
}

/** Confirm a hard delete (single entity). */
export async function elicitDeleteConfirmation(opts: {
  entityLabel: string;
  entityId: string;
  entityName?: string;
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  const display = opts.entityName ? `${opts.entityId} (${opts.entityName})` : opts.entityId;
  return confirmDestructive({
    action: `You are about to delete ${opts.entityLabel} ${display}.`,
    consequence: "Hard delete is irreversible and removes the entity permanently.",
    confirmTitle: "Confirm delete",
    confirmDescription: `Permanently delete ${opts.entityLabel} ${opts.entityId}`,
    sdkContext: opts.sdkContext,
  });
}

/** Confirm a bulk hard delete (array of entity IDs). */
export async function elicitBulkDeleteConfirmation(opts: {
  count: number;
  entityLabel: string;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to delete ${opts.count} ${opts.entityLabel}(s).`,
    consequence: "Hard delete is irreversible and removes the entities permanently.",
    impactPreview: opts.impactPreview,
    confirmTitle: "Confirm bulk delete",
    confirmDescription: `Permanently delete ${opts.count} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
  });
}

/**
 * Confirm a bulk status change (pause, resume, archive, delete). No threshold —
 * any bulk status change elicits, because status transitions are the highest-
 * risk class of bulk mutation.
 */
export async function elicitBulkStatusChangeConfirmation(opts: {
  count: number;
  entityLabel: string;
  targetStatus: string;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to set status='${opts.targetStatus}' on ${opts.count} ${opts.entityLabel}(s).`,
    consequence:
      "Status changes affect spend and delivery immediately. Some transitions (archive, delete) are irreversible on most platforms.",
    impactPreview: opts.impactPreview,
    confirmTitle: "Confirm bulk status change",
    confirmDescription: `Apply status='${opts.targetStatus}' to ${opts.count} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
  });
}

/**
 * Confirm a bulk entity mutation. Skips elicitation when count is below the
 * threshold AND no sensitive field (status/budget/bid) is being changed.
 */
export async function elicitBulkMutationConfirmation(opts: {
  count: number;
  entityLabel: string;
  summary: string;
  hasSensitiveFieldChange?: boolean;
  threshold?: number;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  const threshold = opts.threshold ?? DEFAULT_BULK_THRESHOLD;
  if (opts.count < threshold && !opts.hasSensitiveFieldChange) return true;

  return confirmDestructive({
    action: `You are about to update ${opts.count} ${opts.entityLabel}(s).`,
    consequence: opts.summary,
    impactPreview: opts.impactPreview,
    confirmTitle: "Confirm bulk update",
    confirmDescription: `Apply changes to ${opts.count} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
  });
}

/** Confirm a batch of bid adjustments. */
export async function elicitBidChangeConfirmation(opts: {
  count: number;
  entityLabel: string;
  summary: string;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to adjust bids on ${opts.count} ${opts.entityLabel}(s).`,
    consequence: `${opts.summary} Bid changes take effect on the next auction and can shift spend immediately.`,
    impactPreview: opts.impactPreview,
    confirmTitle: "Confirm bid changes",
    confirmDescription: `Apply bid changes to ${opts.count} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
  });
}

/** Confirm a budget change (single or scheduled). */
export async function elicitBudgetChangeConfirmation(opts: {
  entityLabel: string;
  entityId: string;
  summary: string;
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to change the budget on ${opts.entityLabel} ${opts.entityId}.`,
    consequence: `${opts.summary} Budget changes take effect immediately and directly affect spend.`,
    confirmTitle: "Confirm budget change",
    confirmDescription: `Apply budget change to ${opts.entityLabel} ${opts.entityId}`,
    sdkContext: opts.sdkContext,
  });
}

/** Confirm an offline conversion upload. */
export async function elicitConversionUploadConfirmation(opts: {
  count: number;
  operation: "insert" | "update";
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  const verb = opts.operation === "insert" ? "insert" : "update";
  return confirmDestructive({
    action: `You are about to ${verb} ${opts.count} offline conversion(s).`,
    consequence:
      "Offline conversions feed attribution and bidding models. Bad data can pollute attribution for days and is awkward to fully reverse.",
    impactPreview: opts.impactPreview,
    confirmTitle: `Confirm conversion ${verb}`,
    confirmDescription: `${verb[0].toUpperCase()}${verb.slice(1)} ${opts.count} conversion(s)`,
    sdkContext: opts.sdkContext,
  });
}
