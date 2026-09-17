// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Per-package verification ledger (#203): the source of truth for how far each
// governed tool has been verified.
//
// WHY THIS IS NOT IN THE TOOL ANNOTATION
//
// A tool must not be able to promote itself. The `cesteral` annotation is
// authored in the same file as the tool it describes and travels with it into
// the definitionHash; a `status` field there would be a claim the tool makes
// about its own testing, changed in the same commit that changes the behaviour.
// The ledger is a separate file, so promoting a tool is a visible, reviewable
// edit that is not part of "add a field to my own annotation".
//
// WHY A TOOL ABSENT FROM THE LEDGER IS `declared`
//
// Absence must mean "nothing verified", never "assume fine". A new tool that
// nobody remembers to add lands at the bottom of the ladder by construction.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";

/** A tool with no ledger entry. Never inferred from anything else. */
export const DEFAULT_VERIFICATION = Object.freeze({ status: "declared" });

const VALID_STATUSES = new Set(["declared", "fixture-verified", "live-verified", "disabled"]);

export function ledgerPath(packageDir) {
  return join(ROOT, "packages", packageDir, "verification.json");
}

/**
 * Load a package's ledger. Returns `{}` when the file is absent — every tool
 * then falls to `declared`, which is the safe direction.
 *
 * Throws on a malformed ledger rather than skipping it: a ledger that silently
 * fails to load would demote everything to `declared` and look like a
 * conservative default rather than a broken file.
 */
export function loadLedger(packageDir) {
  const path = ledgerPath(packageDir);
  if (!existsSync(path)) return {};

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(`${packageDir}/verification.json is not valid JSON: ${error.message}`);
  }
  return parseLedger(parsed, `${packageDir}/verification.json`);
}

/**
 * Validate a ledger object. Split from {@link loadLedger} so tests exercise
 * THESE rules rather than a copy of them — a test that restated the validation
 * would stay green while the real loader drifted, which is how a
 * reconstructed-shape test fails silently.
 */
export function parseLedger(parsed, label = "verification.json") {
  const tools = parsed.tools ?? {};
  for (const [toolName, entry] of Object.entries(tools)) {
    if (!VALID_STATUSES.has(entry?.status)) {
      throw new Error(
        `${label}: tool "${toolName}" has status ` +
          `${JSON.stringify(entry?.status)}; expected one of ${[...VALID_STATUSES].join(", ")}`
      );
    }
    if (entry.status === "disabled" && !entry.reason) {
      throw new Error(`${label}: tool "${toolName}" is "disabled" and must state a reason.`);
    }
    const needsHash = entry.status === "fixture-verified" || entry.status === "live-verified";
    if (needsHash && !/^[0-9a-f]{64}$/.test(entry.verifiedDefinitionHash ?? "")) {
      throw new Error(
        `${label}: tool "${toolName}" claims "${entry.status}" without a ` +
          `valid verifiedDefinitionHash. A status that is not bound to a definition cannot be ` +
          `demoted when that definition changes, which is the whole point of recording it.`
      );
    }
    if (needsHash && !entry.evidence) {
      throw new Error(
        `${label}: tool "${toolName}" claims "${entry.status}" without ` +
          `evidence. Link the specific tool result, not merely a report that exists.`
      );
    }
  }
  return tools;
}

/**
 * Resolve the verification block that ships in the manifest for one tool.
 *
 * THIS IS THE LOAD-BEARING FUNCTION. A claim whose `verifiedDefinitionHash` does
 * not equal the definition being shipped is DISCARDED and replaced with
 * `declared` — automatically, with no override anywhere in the ledger or the
 * annotation. A definition change invalidates its verification by construction.
 *
 * The discarded status is preserved as `demotedFrom` so the demotion is visible
 * in the shipped artifact. A demotion that merely produced `declared` would be
 * indistinguishable from a tool nobody ever tested, and the difference matters:
 * one of them has a stale report someone should re-run.
 *
 * @param entry   The ledger claim, or undefined.
 * @param definitionHash The hash actually being shipped.
 */
export function resolveVerification(entry, definitionHash) {
  if (!entry) return { ...DEFAULT_VERIFICATION };

  // `disabled` makes no claim about a definition, so there is nothing to bind
  // or to invalidate — it survives a definition change intact.
  if (entry.status === "disabled") {
    return { status: "disabled", reason: entry.reason };
  }

  if (entry.status === "declared") {
    return { status: "declared" };
  }

  if (entry.verifiedDefinitionHash !== definitionHash) {
    return { status: "declared", demotedFrom: entry.status };
  }

  return {
    status: entry.status,
    verifiedDefinitionHash: entry.verifiedDefinitionHash,
    ...(entry.verifiedAt ? { verifiedAt: entry.verifiedAt } : {}),
    ...(entry.evidence ? { evidence: entry.evidence } : {}),
    ...(entry.testPaths ? { testPaths: [...entry.testPaths] } : {}),
  };
}

/**
 * Release gate: assert no shipped entry claims a verified status whose bound
 * hash disagrees with the definition beside it.
 *
 * `resolveVerification` already makes this unreachable — which is exactly why it
 * is asserted rather than assumed. This is the invariant the whole feature
 * rests on, and it is cheap to check at the point of writing the artifact.
 * Checking that an evidence FILE exists would be trivially satisfiable and
 * would prove nothing; hash equality is mechanical and meaningful.
 */
export function assertVerificationBinding(manifest) {
  const violations = [];
  for (const tool of manifest.tools) {
    const v = tool.verification;
    if (!v) continue;
    if (v.status !== "fixture-verified" && v.status !== "live-verified") continue;
    if (v.verifiedDefinitionHash !== tool.definitionHash) {
      violations.push(
        `  - ${tool.toolName}: status "${v.status}" bound to ${v.verifiedDefinitionHash} ` +
          `but shipping ${tool.definitionHash}`
      );
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Verification binding violated in ${manifest.packageName}:\n${violations.join("\n")}`
    );
  }
}
