// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpError, JsonRpcErrorCode } from "./mcp-errors.js";
import type { DryRunResult, EffectDryRunResult } from "../types/dry-run-result.js";

/**
 * Enforce, at the point of return, that a dry-run result honors the
 * `requiresValidation` / `requiresSimulation` contract promises a governed
 * write tool's annotation declares.
 *
 * A governed write tool MUST NOT emit a dry-run payload carrying
 * `validationSource: "none"`, `expectedStateSource: "none"`, or a missing
 * `expectedPostState`: the governance layer's `validateStructuredResponse`
 * treats such a response as a `requiresValidation` / `requiresSimulation`
 * contract violation and demotes the tool to `drifted`.
 *
 * When a dry-run genuinely cannot validate or simulate (upstream validator
 * unavailable, read-partner failure, entity outside canonical scope), the
 * honest outcome is to FAIL the tool call. A dry-run mutates nothing, so
 * throwing is side-effect-free — strictly better than returning a payload
 * that lies about the contract and silently demotes the tool downstream.
 *
 * Call this on the result of every governed `dry_run` path.
 */
export function assertGovernedDryRunResult(result: DryRunResult, toolLabel: string): DryRunResult {
  if (result.validationSource === "none") {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `${toolLabel}: dry-run could not validate the proposed mutation ` +
        `(validationSource "none"). The tool contract promises requiresValidation — ` +
        `failing the call rather than returning an unvalidated dry-run.`
    );
  }
  if (result.expectedStateSource === "none" || result.expectedPostState === undefined) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `${toolLabel}: dry-run could not produce an expected post-state ` +
        `(expectedStateSource "none"). The tool contract promises requiresSimulation — ` +
        `failing the call rather than returning an incomplete dry-run.`
    );
  }
  return result;
}

/**
 * Effect-class parallel to {@link assertGovernedDryRunResult}.
 *
 * Effect writes (uploads, report schedules, conversion uploads, bulk jobs)
 * declare HONEST `requiresValidation` / `requiresSimulation` booleans — some
 * cannot validate or simulate at all. This asserts the dry-run only against the
 * promises the contract actually makes:
 *
 * - `requiresValidation: true` → `validationSource` must not be `"none"`.
 * - `requiresSimulation: true` → `expectedEffectSource` must not be `"none"` and
 *   `expectedEffect` must be present.
 *
 * When the contract promises `false`, a `"none"` source is legitimate and this
 * returns the result unchanged. Dry-run only — never call on the execute path
 * (a dry-run mutates nothing, so throwing here is side-effect-free).
 */
export function assertGovernedEffectDryRun(
  result: EffectDryRunResult,
  toolLabel: string,
  promises: { requiresValidation: boolean; requiresSimulation: boolean }
): EffectDryRunResult {
  if (promises.requiresValidation && result.validationSource === "none") {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `${toolLabel}: effect dry-run could not validate the proposed write ` +
        `(validationSource "none") despite requiresValidation — failing the call.`
    );
  }
  if (
    promises.requiresSimulation &&
    (result.expectedEffectSource === "none" || result.expectedEffect === undefined)
  ) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `${toolLabel}: effect dry-run could not produce an expected effect ` +
        `(expectedEffectSource "none") despite requiresSimulation — failing the call.`
    );
  }
  return result;
}
