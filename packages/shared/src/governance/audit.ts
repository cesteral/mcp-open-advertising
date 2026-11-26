// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { recordDecisionTokenVerification } from "../utils/observability/metrics.js";
import type { DecisionTokenVerdict } from "./decision-token.js";
import type { TokenMode } from "./config.js";

/** Minimal structural logger (pino-compatible) so this stays test-friendly. */
export interface AuditLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

/**
 * Emit a structured audit record for a decision-token verification and record
 * the verification metric. Success logs at `info`, any rejection at `warn` so
 * ops can alert on it. NEVER logs the raw token or secret — only the safe claim
 * subset the verdict already carries.
 */
export function logDecisionTokenVerdict(
  logger: AuditLogger,
  args: {
    verdict: DecisionTokenVerdict;
    mode: TokenMode;
    contractId: string;
    toolName: string;
  }
): void {
  const { verdict, mode, contractId, toolName } = args;

  const record = {
    component: "governance-audit",
    event: "decision_token_verification",
    status: verdict.ok ? "ok" : "rejected",
    reasonCode: verdict.reasonCode,
    detail: verdict.detail,
    definitionHashVerified: verdict.definitionHashVerified,
    hashAlg: verdict.hashAlg,
    orderSensitiveArgs: verdict.orderSensitiveArgs,
    mode,
    contractId,
    toolName,
    sub: verdict.claims?.sub,
    jti: verdict.claims?.jti,
    approvalId: verdict.claims?.approvalId,
  };

  if (verdict.ok) {
    logger.info(record, "decision token verified");
  } else {
    logger.warn(record, `decision token rejected: ${verdict.reasonCode}`);
  }

  recordDecisionTokenVerification(verdict.reasonCode, mode);
}

/**
 * How one destructive-operation confirmation was decided.
 *
 *  - `accepted` / `declined` / `cancelled`: the user answered. Accepting the
 *    form without ticking the confirm box is `declined`.
 *  - `refused_no_channel`: an irreversible operation, and the client cannot
 *    answer a form on this call, so it was refused.
 *  - `allowed_no_channel`: a reversible operation, and the client cannot
 *    answer, so it went ahead unconfirmed (the permissive fallback).
 *  - `skipped_by_env`: `MCP_ELICIT_DESTRUCTIVE=skip`; nobody was asked.
 *  - `approved_by_governance`: the call carries a decision token that verified
 *    on this call and names an `approvalId`, so a person already approved
 *    exactly this call in governance; nobody was asked again (B6).
 */
export type DestructiveConfirmationOutcome =
  | "accepted"
  | "declined"
  | "cancelled"
  | "refused_no_channel"
  | "allowed_no_channel"
  | "skipped_by_env"
  | "approved_by_governance";

/**
 * What the tool-handler factory knows about the call a confirmation belongs to.
 * The factory puts it on the call's request context (`confirmationAudit`), so
 * the confirmation helpers read it without any call site passing it in. Every
 * field is already safe to log: digests and tags, never raw values.
 */
export interface ConfirmationAuditScope {
  /** The server's logger, so the record carries the server's bindings. */
  logger: AuditLogger;
  toolName: string;
  /** `digestArguments` of the call's raw arguments (SHA-256, hex). */
  argsDigest: string;
  /** HMAC tag of the principal: the same tag a sealed `requestState` carries. */
  principalTag: string;
  /**
   * From a decision token that verified on this call; absent otherwise. The
   * factory sets them only on a verified verdict, in every token mode, so a
   * non-empty `approvalId` here means a person approved exactly this call:
   * `confirmDestructive` treats it as the confirmation (B6).
   */
  jti?: string;
  approvalId?: string;
  /** The call is a dry run: never confirmed, by a person or by governance. */
  dryRun?: boolean;
  /**
   * True when the answer to this prompt was given in an EARLIER round and is
   * only carried forward in the sealed `requestState`. That decision was
   * recorded on the round that received it, so it is not recorded again.
   */
  isCarriedAnswer?: (elicitParams: Record<string, unknown>) => boolean;
}

/**
 * Emit the `governance-audit` record for one destructive-operation
 * confirmation decision. A refusal for lack of a channel and the env bypass log
 * at `warn`, everything else at `info`. The caller passes the action text
 * already redacted; nothing here carries a raw token or raw arguments.
 */
export function logDestructiveConfirmation(
  logger: AuditLogger,
  args: {
    action: string;
    outcome: DestructiveConfirmationOutcome;
    irreversible: boolean;
    scope?: Omit<ConfirmationAuditScope, "logger" | "isCarriedAnswer" | "dryRun">;
  }
): void {
  const { action, outcome, irreversible, scope } = args;
  const record = {
    component: "governance-audit",
    event: "destructive_confirmation",
    outcome,
    action,
    irreversible,
    toolName: scope?.toolName,
    argsDigest: scope?.argsDigest,
    principalTag: scope?.principalTag,
    jti: scope?.jti,
    approvalId: scope?.approvalId,
  };
  if (outcome === "refused_no_channel" || outcome === "skipped_by_env") {
    logger.warn(record, `destructive confirmation: ${outcome}`);
  } else {
    logger.info(record, `destructive confirmation: ${outcome}`);
  }
}
