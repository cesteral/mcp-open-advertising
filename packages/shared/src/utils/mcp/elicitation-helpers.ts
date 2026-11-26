// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared MCP elicitation patterns for destructive write paths. All named
 * helpers funnel through `confirmDestructive` so prompt shape, decline
 * handling, and the `MCP_ELICIT_DESTRUCTIVE` env knob stay uniform.
 */

import { createLogger } from "../observability/logger.js";
import { getRequestContext } from "../observability/request-context.js";
import { redactSecretsInText } from "../observability/secret-redaction.js";
import {
  logDestructiveConfirmation,
  type DestructiveConfirmationOutcome,
} from "../../governance/audit.js";
import { McpError, JsonRpcErrorCode } from "../mcp-errors.js";
import { findTerminalStatusValues } from "./terminal-values.js";

const logger = createLogger("elicitation-helpers");
/** Used only when no tool-handler factory scope is in force (direct calls, tests). */
const auditLogger = createLogger("governance-audit");

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
  /**
   * Set for operations that cannot be undone (hard delete, archive). With no
   * elicitation channel these DENY rather than allow — see `confirmDestructive`.
   */
  irreversible?: boolean;
}

const IMPACT_PREVIEW_CAP = 5;

/**
 * Returns `true` (allow) when `MCP_ELICIT_DESTRUCTIVE=skip` is set, when the
 * call carries a verified decision token with an `approvalId` (a person
 * approved this exact call in governance), when the user accepts, or — for
 * reversible operations only — when there is no elicitation channel. Returns `false` when the user declines, and when an
 * IRREVERSIBLE operation has no channel to confirm through.
 *
 * That last case is the change (sweep 2026-07-25, 05-F2). The no-channel branch
 * returned `true` unconditionally, and `tool-handler-factory` leaves
 * `elicitInput` undefined for any client that does not advertise the
 * elicitation capability — every stdio and headless client. Combined with token
 * mode defaulting to `off`, a default-deployed dv360-mcp hard-deleted a campaign
 * on a single call with no token, no confirmation, and nothing to decline
 * through. "The client cannot ask" is not consent.
 *
 * Reversible operations keep the permissive fallback: a bulk status change or
 * bid adjustment can be put back, so failing those closed would break headless
 * automation for no safety gain.
 *
 * The escape hatch is unchanged and now evaluated FIRST: an operator who sets
 * `MCP_ELICIT_DESTRUCTIVE=skip` has explicitly opted out and keeps working
 * headless, including for deletes.
 *
 * SDK errors propagate.
 */
async function confirmDestructive(opts: ConfirmDestructiveOpts): Promise<boolean> {
  // Explicit operator opt-out wins, so a headless deployment that has chosen
  // this posture is unaffected by the fail-closed branch below.
  if (shouldSkipElicitation()) {
    audit(opts, "skipped_by_env");
    return true;
  }

  // A person already approved exactly this call in governance (B6): the
  // decision token verified on this call (`actionHash` binds the executable
  // args and contract, the `jti` is consumed once) and names an `approvalId`.
  // That approval is the confirmation, so the in-client question is not asked
  // again, irreversible or not, with a channel or without one.
  if (hasGovernanceApproval()) {
    audit(opts, "approved_by_governance");
    return true;
  }

  if (!opts.sdkContext?.elicitInput) {
    if (!opts.irreversible) {
      audit(opts, "allowed_no_channel");
      return true;
    }
    logger.warn(
      { action: redactSecretsInText(opts.action), env: ELICIT_ENV_VAR },
      `Refusing an irreversible operation: the client advertises no elicitation ` +
        `capability, so there is no way to confirm it. Use a client that supports ` +
        `elicitation, or set ${ELICIT_ENV_VAR}=skip to accept these operations unconfirmed.`
    );
    audit(opts, "refused_no_channel");
    return false;
  }

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

  const elicitParams = {
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
  };
  // A `ConfirmationRequired` thrown here (an MRTR round that only asks) and any
  // SDK error propagate before the audit call below: neither is a decision.
  const result = (await opts.sdkContext.elicitInput(elicitParams)) as ElicitInputResult;

  const confirmed = result.action === "accept" && result.content?.confirm === true;
  // On a later MRTR round the handler re-runs from the top, and an answer given
  // in an earlier round is replayed from the sealed state: that decision was
  // audited when it arrived, so it is not recorded twice.
  if (!getRequestContext()?.confirmationAudit?.isCarriedAnswer?.(elicitParams)) {
    audit(opts, confirmed ? "accepted" : result.action === "cancel" ? "cancelled" : "declined");
  }
  return confirmed;
}

/**
 * True only when the tool-handler factory verified a decision token on THIS
 * call and that token names an `approvalId`. The factory sets `jti` and
 * `approvalId` on the call's scope only for a verified verdict, in every token
 * mode (a warn-mode token that fails verification sets neither), and mode
 * `off` verifies nothing. A verified token without `approvalId` is a machine
 * caller admitted by policy, not by a person, and does not count. A dry run
 * never counts: it must not be confirmed by anyone. Outside a factory scope
 * there is no verified token, so this is false.
 */
function hasGovernanceApproval(): boolean {
  const scope = getRequestContext()?.confirmationAudit;
  if (!scope || scope.dryRun) return false;
  return (
    typeof scope.jti === "string" &&
    scope.jti.length > 0 &&
    typeof scope.approvalId === "string" &&
    scope.approvalId.length > 0
  );
}

/**
 * One `governance-audit` record per confirmation decision. The call's tool,
 * args digest, principal tag and verified token ids come from the request
 * context the tool-handler factory installs; outside the factory (a unit test,
 * a direct call) the record carries the action and outcome only.
 */
function audit(opts: ConfirmDestructiveOpts, outcome: DestructiveConfirmationOutcome): void {
  const scope = getRequestContext()?.confirmationAudit;
  logDestructiveConfirmation(scope?.logger ?? auditLogger, {
    // The action text can quote entity names from the platform; strip anything
    // secret-shaped the same way failure records are.
    action: redactSecretsInText(opts.action),
    outcome,
    irreversible: opts.irreversible === true,
    scope: scope && {
      toolName: scope.toolName,
      argsDigest: scope.argsDigest,
      principalTag: scope.principalTag,
      jti: scope.jti,
      approvalId: scope.approvalId,
    },
  });
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
    irreversible: true,
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
    irreversible: true,
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
    irreversible: true,
  });
}

/**
 * Confirm a bulk status change. No threshold — any bulk status change elicits,
 * because status transitions are the highest-risk class of bulk mutation.
 *
 * `irreversible` is required, so every caller decides: `true` when the target
 * status is one of the platform's `terminalStatusValues` (registry.json; ask
 * `isTerminalStatusValue(terminalStatusValuesFor(TOOL_NAME), status)`). With
 * no elicitation channel an irreversible batch is then refused instead of
 * going ahead unconfirmed, as an archive or a delete is.
 */
export async function elicitBulkStatusChangeConfirmation(opts: {
  count: number;
  entityLabel: string;
  targetStatus: string;
  irreversible: boolean;
  impactPreview?: string[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({
    action: `You are about to set status='${opts.targetStatus}' on ${opts.count} ${opts.entityLabel}(s).`,
    consequence: opts.irreversible
      ? `status='${opts.targetStatus}' is terminal on this platform: it cannot be undone through this server.`
      : "Status changes affect spend and delivery immediately. Some transitions (archive, delete) are irreversible on most platforms.",
    impactPreview: opts.impactPreview,
    confirmTitle: opts.irreversible
      ? "Confirm irreversible status change"
      : "Confirm bulk status change",
    confirmDescription: `Apply status='${opts.targetStatus}' to ${opts.count} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
    irreversible: opts.irreversible,
  });
}

/** One entity of a write whose payload sets a terminal value. */
export interface TerminalTransitionItem {
  /** The entity id (or URN) as the caller named it. */
  id: string;
  /** What is set, e.g. `entityStatus=ENTITY_STATUS_ARCHIVED`, or `remove`. */
  transitions: string[];
}

/**
 * Confirm a terminal status or field transition on one entity or many. Always
 * irreversible: with no elicitation channel it is refused (unless
 * `MCP_ELICIT_DESTRUCTIVE=skip` or a verified governance approval). Ask ONCE for
 * a whole batch, before its first write, with every terminal item listed.
 */
export async function elicitTerminalTransitionConfirmation(opts: {
  /** Entities the call writes; may exceed `terminalItems.length` for a mixed batch. */
  count: number;
  entityLabel: string;
  terminalItems: TerminalTransitionItem[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  const n = opts.terminalItems.length;
  const single = n === 1 && opts.count === 1;
  const action = single
    ? `You are about to make an irreversible change to ${opts.entityLabel} ${opts.terminalItems[0]!.id}: ${opts.terminalItems[0]!.transitions.join(", ")}.`
    : `You are about to make an irreversible change to ${n} of ${opts.count} ${opts.entityLabel}(s).`;
  return confirmDestructive({
    action,
    consequence:
      "These values are terminal on this platform: no tool on this server can return the entities to their previous state.",
    impactPreview: single
      ? undefined
      : opts.terminalItems.map((item) => `${item.id}: ${item.transitions.join(", ")}`),
    confirmTitle: "Confirm irreversible change",
    confirmDescription: single
      ? `Apply the irreversible change to ${opts.entityLabel} ${opts.terminalItems[0]!.id}`
      : `Apply the irreversible change to ${n} ${opts.entityLabel}(s)`,
    sdkContext: opts.sdkContext,
    irreversible: true,
  });
}

/**
 * The items of a write whose payload sets one of the platform's terminal
 * status values. Pass `terminalStatusValuesFor(TOOL_NAME)`, resolved once at
 * module load so a registry gap fails the boot. Pure; empty for an ordinary
 * update.
 */
export function findTerminalTransitions(
  terminal: ReadonlySet<string>,
  items: ReadonlyArray<{ id: string; payload: unknown }>
): TerminalTransitionItem[] {
  const found: TerminalTransitionItem[] = [];
  for (const item of items) {
    const hits = findTerminalStatusValues(item.payload, terminal);
    if (hits.length > 0) {
      found.push({ id: item.id, transitions: hits.map((h) => `${h.path}=${h.value}`) });
    }
  }
  return found;
}

/**
 * The error a tool with no `confirmed: false` result shape throws when an
 * irreversible operation was declined, or could not be confirmed because the
 * client has no elicitation channel. Nothing was written. `subject` names the
 * operation, e.g. "the bid list delete".
 */
export function irreversibleNotConfirmedError(subject: string): McpError {
  return new McpError(
    JsonRpcErrorCode.InvalidRequest,
    `Not applied: ${subject} was not confirmed, so nothing was written. Either the ` +
      `confirmation was declined, or the client cannot answer one (a client with elicitation ` +
      `support, a governance approval, or ${ELICIT_ENV_VAR}=skip lets it run).`,
    { reason: "irreversible_operation_not_confirmed" }
  );
}

/**
 * For a tool whose result has no `confirmed: false` shape (update_entity,
 * bulk_mutate): when any item sets a terminal value, ask once and throw
 * `irreversibleNotConfirmedError` unless confirmed. Returns without asking
 * when nothing in the call is terminal. Call it after the dry-run return and
 * before the first upstream write, outside any `try/catch` that records
 * failures.
 */
export async function assertTerminalTransitionsConfirmed(opts: {
  count: number;
  entityLabel: string;
  terminalItems: TerminalTransitionItem[];
  sdkContext?: ElicitContext;
}): Promise<void> {
  if (opts.terminalItems.length === 0) return;
  const confirmed = await elicitTerminalTransitionConfirmation(opts);
  if (!confirmed) {
    throw irreversibleNotConfirmedError(`the irreversible change to the ${opts.entityLabel}`);
  }
}

/**
 * Confirm an irreversible operation that is not an entity delete, archive or
 * status transition: a free-form mutation document, a delete inside a `manage`
 * tool. Always irreversible.
 */
export async function elicitIrreversibleOperationConfirmation(opts: {
  action: string;
  consequence: string;
  impactPreview?: string[];
  confirmTitle: string;
  confirmDescription: string;
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  return confirmDestructive({ ...opts, irreversible: true });
}

/**
 * Confirm a bulk entity mutation. Skips elicitation when count is below the
 * threshold AND no sensitive field (status/budget/bid) is being changed.
 *
 * When `terminalItems` is non-empty (`findTerminalTransitions`), the batch sets
 * a terminal value: it asks the one irreversible question instead, whatever the
 * count, so a batch is still asked exactly once.
 */
export async function elicitBulkMutationConfirmation(opts: {
  count: number;
  entityLabel: string;
  summary: string;
  hasSensitiveFieldChange?: boolean;
  threshold?: number;
  impactPreview?: string[];
  terminalItems?: TerminalTransitionItem[];
  sdkContext?: ElicitContext;
}): Promise<boolean> {
  if (opts.terminalItems && opts.terminalItems.length > 0) {
    return elicitTerminalTransitionConfirmation({
      count: opts.count,
      entityLabel: opts.entityLabel,
      terminalItems: opts.terminalItems,
      sdkContext: opts.sdkContext,
    });
  }
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
