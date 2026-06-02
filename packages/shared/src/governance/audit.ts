// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { recordDecisionTokenVerification } from "../utils/metrics.js";
import type { DecisionTokenVerdict } from "./decision-token.js";
import type { TokenMode } from "./config.js";

/** Minimal structural logger (pino-compatible) so this stays test-friendly. */
interface AuditLogger {
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
