// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared MCP elicitation patterns for destructive write paths. All named
 * helpers funnel through `confirmDestructive` so prompt shape, decline
 * handling, and the `MCP_ELICIT_DESTRUCTIVE` env knob stay uniform.
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
 * Bulk mutations under this count skip elicitation unless they touch a
 * sensitive field — small-batch operator fixes stay friction-free while
 * meaningful blast radius is still gated.
 */
const DEFAULT_BULK_THRESHOLD = 10;

/**
 * Permissive on purpose — false positives only cost one extra confirmation,
 * but false negatives let spend changes through ungated.
 */
const SENSITIVE_FIELD_PATTERN = /(status|archived|active|budget|bid|cpc|cpm|spend|cap|pacing)/i;

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

function shouldSkipElicitation(): boolean {
  const raw = process.env[ELICIT_ENV_VAR];
  if (!raw) return false;
  if (raw === "skip") return true;
  if (raw === "require") return false;
  logger.warn(
    { env: ELICIT_ENV_VAR, value: raw },
    `Unknown ${ELICIT_ENV_VAR} value; treating as 'require'. Accepted values: require | skip.`
  );
  return false;
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
 * Returns `true` (allow) when the SDK context has no `elicitInput` (stdio /
 * client lacks elicitation capability — gated by tool-handler-factory),
 * when `MCP_ELICIT_DESTRUCTIVE=skip` is set, or when the user accepts.
 * Returns `false` only when the user actively declines. SDK errors propagate.
 */
async function confirmDestructive(opts: ConfirmDestructiveOpts): Promise<boolean> {
  if (!opts.sdkContext?.elicitInput) return true;
  if (shouldSkipElicitation()) return true;

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

  const result = (await opts.sdkContext.elicitInput({
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

  return result.action === "accept" && result.content?.confirm === true;
}

/** Confirm an archive operation (soft delete that cannot be reactivated on most platforms). */
export async function elicitArchiveConfirmation(opts: {
  count: number;
  entityLabel: string;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to archive ${opts.count} ${opts.entityLabel}(s).`,
    consequence: "This action is irreversible — archived entities cannot be reactivated.",
    impactPreview: opts.impactPreview,
    confirmTitle: "Confirm archive",
    confirmDescription: `Archive ${opts.count} ${opts.entityLabel}(s) permanently`,
    sdkContext: opts.sdkContext,
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
 * Confirm a bulk status change. No threshold — any bulk status change elicits,
 * because status transitions are the highest-risk class of bulk mutation.
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
