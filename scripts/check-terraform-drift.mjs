#!/usr/bin/env node
/**
 * Terraform state drift check.
 *
 * Runs a `terraform plan` for one environment against live GCP and fails when
 * the plan contains a reconciliation action nobody asked for — a resource
 * Terraform would have to create or destroy to make reality match state.
 *
 * Why this exists (runbook 2026-07-27-dev-fleet-lb-recovery):
 *
 *   A closed billing account had GCP reclaim 43 resources of the dev fleet — the
 *   load balancer, VPC, serverless subnet, Cloud Router, Cloud NAT and 3
 *   firewall rules. Terraform state still listed every one of them as existing.
 *   Nothing detected it for a week; it surfaced by accident in a plan run for
 *   unrelated work, with mcp.cesteral.com dead the whole time. The 13 Cloud Run
 *   services were never affected, which is exactly why nothing looked wrong from
 *   the inside.
 *
 * Why it is NOT a PR-blocking check:
 *
 *   It depends on external state. Wiring it into the PR path would hand an
 *   outside system a switch that turns `main` red at a time of its choosing.
 *   The PR path stays hermetic; this runs on a schedule so divergence surfaces
 *   as a dated, reviewable signal.
 *
 * Exit codes: 0 = no unexpected drift, 1 = drift detected, 2 = could not check
 * (auth, network, backend unreachable, unrecognized plan shape) — distinguished
 * so a scheduled failure is diagnosable without opening logs.
 *
 * `terraform plan -detailed-exitcode` is deliberately NOT used: its convention
 * is `2 = changes present, 1 = error`, exactly inverted from the above. Wrapping
 * it invites a silent mix-up where "could not check" reads as "drift found".
 * A plain plan plus `terraform show -json` is the equivalent, and yields
 * resource addresses rather than a boolean.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TERRAFORM_DIR = path.join(REPO_ROOT, "terraform");
const TERRAFORM_DIR_REL = "terraform";

export const EXIT_OK = 0;
export const EXIT_DRIFT = 1;
export const EXIT_CANNOT_CHECK = 2;

/**
 * The complete set of action arrays Terraform documents for a change
 * representation. The two "replace" spellings exist so callers can scan the
 * list for "delete" to catch all three situations where an object is destroyed
 * — which is what classifyPlan does.
 *
 * Anything outside this set is a Terraform version that knows something we do
 * not, and is treated as "could not check" rather than silently tolerated.
 *
 * Keyed on JSON.stringify, NOT on join(","). Joining is lossy: the malformed
 * single-element array ["delete,create"] joins to the same "delete,create" as
 * the legitimate two-element ["delete","create"], so it passed validation and
 * then classified as TOLERATED — because `includes("delete")` is false for the
 * comma-joined element. A destructive-looking plan would have been reported
 * clean. JSON.stringify distinguishes element boundaries and quoting.
 */
const KNOWN_ACTION_SETS = new Set(
  [
    ["no-op"],
    ["create"],
    ["read"],
    ["update"],
    ["delete"],
    ["delete", "create"],
    ["create", "delete"],
  ].map((a) => JSON.stringify(a))
);

/**
 * A short, non-leaking label for an action array in an error message.
 *
 * Error reasons are written to the report file and from there into a public
 * GitHub issue, so nothing may echo attacker- or plan-controlled content. Only
 * elements that look like real Terraform action keywords are shown verbatim.
 */
function safeActionsLabel(actions) {
  if (!Array.isArray(actions)) return "<not an array>";
  return `[${actions
    .map((a) => (typeof a === "string" && /^[a-z-]{1,12}$/.test(a) ? a : "<invalid>"))
    .join(",")}]`;
}

/**
 * Actions that mean Terraform would add or remove an object. These are the
 * alerting set. During the 2026-07-27 recovery the plan carried 68 creates —
 * resources state believed in that GCP had reclaimed.
 */
function isUnexpectedAction(actions) {
  return actions.includes("delete") || (actions.length === 1 && actions[0] === "create");
}

/**
 * Plan JSON format versions this classifier understands. A major bump is a
 * breaking change to the representation, so refuse rather than guess.
 */
export function isSupportedFormatVersion(formatVersion) {
  return typeof formatVersion === "string" && /^1\.\d+$/.test(formatVersion);
}

/**
 * The pure core: turn plan JSON into a verdict.
 *
 * Returns { ok: true, unexpected, tolerated, drift } or { ok: false, reason }
 * where !ok always means exit 2 — an unrecognized plan shape is never
 * interpreted as "clean".
 */
export function classifyPlan(planJson) {
  if (!planJson || typeof planJson !== "object") {
    return { ok: false, reason: "plan JSON is not an object" };
  }
  if (!isSupportedFormatVersion(planJson.format_version)) {
    return {
      ok: false,
      reason:
        `unsupported plan format_version ${JSON.stringify(planJson.format_version)} ` +
        `(this checker understands 1.x)`,
    };
  }
  if (!Array.isArray(planJson.resource_changes)) {
    return { ok: false, reason: "plan JSON has no resource_changes array" };
  }

  const drift = Array.isArray(planJson.resource_drift) ? planJson.resource_drift : [];

  /**
   * Addresses Terraform reported as having changed outside Terraform. Used only
   * to LABEL an alerting address, never to gate one: the JSON format docs do not
   * guarantee that a remotely-deleted object appears here, so correctness must
   * not depend on it.
   */
  const driftedAddresses = new Set(drift.map((d) => d?.address).filter(Boolean));

  const unexpected = [];
  const tolerated = [];

  for (const [index, change] of planJson.resource_changes.entries()) {
    const address = change?.address;
    const actions = change?.change?.actions;

    // Failure reasons end up in a public GitHub issue, so they identify the
    // offending entry POSITIONALLY and by validated address only. Serializing
    // the entry itself would put before/after attribute values in the issue and
    // break the addresses-and-actions-only guarantee.
    if (typeof address !== "string" || address === "") {
      return {
        ok: false,
        reason: `malformed resource_changes[${index}]: missing or non-string address`,
      };
    }
    const safeAddress = address.slice(0, 200);
    if (!Array.isArray(actions)) {
      return {
        ok: false,
        reason: `malformed resource_changes[${index}] (${safeAddress}): actions is not an array`,
      };
    }
    if (!KNOWN_ACTION_SETS.has(JSON.stringify(actions))) {
      return {
        ok: false,
        reason:
          `unrecognized action array ${safeActionsLabel(actions)} on resource_changes[${index}] ` +
          `(${safeAddress}) — refusing to classify a Terraform action this checker does not know`,
      };
    }

    if (isUnexpectedAction(actions)) {
      unexpected.push({
        address,
        actions,
        // Corroborated by a refresh-detected change, or only visible as a
        // config-vs-state difference. Advisory: see the comment above.
        evidence: driftedAddresses.has(address) ? "external-change" : "config-or-state",
      });
    } else {
      tolerated.push({ address, actions });
    }
  }

  return { ok: true, unexpected, tolerated, drift: drift.map((d) => d.address) };
}

/** Group tolerated/drift entries into `action -> count` for the summary. */
export function tallyActions(entries) {
  const counts = {};
  for (const { actions } of entries) {
    const key = JSON.stringify(actions);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Default subprocess runner. Injectable so tests can pin failure handling. */
function defaultRunner(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: TERRAFORM_DIR,
    encoding: "utf8",
    ...opts,
  });
}

/**
 * Refuse to run against a tree with uncommitted Terraform changes — otherwise a
 * local edit is reported as infrastructure drift. Scoped to terraform/ so an
 * unrelated dirty file elsewhere does not block the check.
 */
export function findPreexistingChanges(porcelainOutput) {
  return porcelainOutput
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.slice(3).trim())
    .filter((file) => file.startsWith(TERRAFORM_DIR_REL));
}

/**
 * Render the report consumed by the workflow's GitHub issue.
 *
 * Deliberately narrow: resource addresses, action arrays, and counts only.
 * Terraform stderr is written to the (access-controlled) job log via `hint` but
 * never here, because an issue is far more visible than a job log and plan
 * output can carry configuration detail.
 */
export function renderReport(env, result) {
  const lines = [`<!-- terraform-drift:${env} -->`, ""];

  if (result.status === EXIT_CANNOT_CHECK) {
    lines.push(
      `## \`${env}\` — could not check`,
      "",
      `**${result.reason}**`,
      "",
      "This is not a clean result. An unchecked environment is exactly the state",
      "the fleet was in for the week of the 2026-07-27 outage.",
      "",
      "Full diagnostics are in the workflow job log."
    );
  } else if (result.status === EXIT_DRIFT) {
    lines.push(
      `## \`${env}\` — drift detected`,
      "",
      `${result.unexpected.length} resource(s) would be created, destroyed or replaced`,
      "to make live GCP match Terraform state.",
      ""
    );
    const external = result.unexpected.filter((u) => u.evidence === "external-change");
    const configOnly = result.unexpected.filter((u) => u.evidence !== "external-change");
    if (external.length > 0) {
      lines.push(
        `### Changed outside Terraform (${external.length})`,
        "",
        "Corroborated by refresh — something mutated these in GCP.",
        "",
        ...external.map((u) => `- \`${u.actions.join(",")}\` — \`${u.address}\``),
        ""
      );
    }
    if (configOnly.length > 0) {
      lines.push(
        `### Not seen by refresh (${configOnly.length})`,
        "",
        "Likely unapplied configuration or a state/config mismatch.",
        "",
        ...configOnly.map((u) => `- \`${u.actions.join(",")}\` — \`${u.address}\``),
        ""
      );
    }
    lines.push("Runbook: `docs/runbooks/2026-07-27-dev-fleet-lb-recovery.md`");
  } else {
    lines.push(
      `## \`${env}\` — clean`,
      "",
      "No resource would be created, destroyed or replaced to reconcile live GCP",
      "with Terraform state.",
      "",
      `Tolerated in-place/no-op changes: ${result.toleratedCount}.`,
      `Refresh-detected attribute drift (not alerted): ${result.driftCount}.`
    );
  }

  return lines.join("\n") + "\n";
}

function writeReport(ctx, result) {
  if (!ctx?.reportFile) return;
  try {
    fs.writeFileSync(ctx.reportFile, renderReport(ctx.env ?? "unknown", result));
  } catch (error) {
    console.error(`  (could not write report file: ${error.message})`);
  }
}

function makeFail(ctx) {
  return (reason, hint) => {
    console.error(`\n✖ Cannot check for drift: ${reason}`);
    if (hint) console.error(`\n  ${hint}`);
    writeReport(ctx, { status: EXIT_CANNOT_CHECK, reason });
    return EXIT_CANNOT_CHECK;
  };
}

export function checkDrift({
  env,
  runner = defaultRunner,
  makeTempDir,
  exists = fs.existsSync,
  reportFile = process.env.DRIFT_REPORT_FILE,
} = {}) {
  const fail = makeFail({ env, reportFile });

  if (!env || !/^[a-z0-9-]+$/.test(env)) {
    return fail(
      `invalid environment ${JSON.stringify(env)}`,
      "Usage: check-terraform-drift.mjs <env>"
    );
  }

  const backendConf = `backend-${env}.conf`;
  const varFile = `${env}.tfvars`;

  for (const required of [backendConf, varFile]) {
    if (!exists(path.join(TERRAFORM_DIR, required))) {
      return fail(
        `terraform/${required} is missing`,
        `It is gitignored, so CI must materialize it. Locally: copy terraform/${required}.example.`
      );
    }
  }

  const status = runner("git", ["status", "--porcelain", "--", TERRAFORM_DIR_REL], {
    cwd: REPO_ROOT,
  });
  if (status.status !== 0) {
    return fail("`git status` failed", (status.stderr ?? "").trim());
  }
  const preexisting = findPreexistingChanges(status.stdout ?? "");
  if (preexisting.length > 0) {
    console.error("✖ Terraform files already differ from HEAD:");
    preexisting.forEach((f) => console.error(`    ${f}`));
    return fail(
      "the working tree is dirty",
      "Commit or revert them first — this check cannot attribute the diff."
    );
  }

  // A saved plan contains the full configuration and sensitive values in
  // cleartext, so it never touches the repo or a world-readable temp path.
  const tmpDir = (makeTempDir ?? (() => fs.mkdtempSync(path.join(os.tmpdir(), "tf-drift-"))))();
  try {
    fs.chmodSync(tmpDir, 0o700);
  } catch {
    // A test double may hand back a path that does not exist; the real path is
    // created by mkdtemp at 0700 already.
  }

  try {
    console.log(`🔄 [${env}] terraform init (readonly lockfile)...`);
    const init = runner("terraform", [
      "init",
      `-backend-config=${backendConf}`,
      "-reconfigure",
      "-lockfile=readonly",
      "-input=false",
      "-no-color",
    ]);
    if (init.status !== 0) {
      return fail(
        "`terraform init` failed — the backend is unreachable or credentials are invalid",
        (init.stderr ?? "").trim().slice(0, 2000)
      );
    }

    const planFile = path.join(tmpDir, "drift.tfplan");
    console.log(`🔄 [${env}] terraform plan (read-only, -lock=false)...`);
    const plan = runner("terraform", [
      "plan",
      `-var-file=${varFile}`,
      "-lock=false",
      "-input=false",
      "-no-color",
      `-out=${planFile}`,
    ]);
    if (plan.status !== 0) {
      return fail(
        "`terraform plan` failed",
        (plan.stderr ?? "").trim().slice(0, 2000) ||
          "No stderr. An empty result from an authenticated command is NOT evidence " +
            "of absence — an expired token yields empty output."
      );
    }

    const show = runner("terraform", ["show", "-json", planFile], { maxBuffer: 256 * 1024 * 1024 });
    if (show.status !== 0) {
      return fail("`terraform show -json` failed", (show.stderr ?? "").trim().slice(0, 2000));
    }

    let planJson;
    try {
      planJson = JSON.parse(show.stdout ?? "");
    } catch (error) {
      return fail(`could not parse plan JSON: ${error.message}`);
    }

    const verdict = classifyPlan(planJson);
    if (!verdict.ok) {
      return fail(verdict.reason, "Failing closed rather than reporting a clean run.");
    }

    return report({ env, reportFile }, verdict);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function report(ctx, { unexpected, tolerated, drift }) {
  const { env } = ctx;
  const toleratedCounts = tallyActions(tolerated);
  const summary = Object.entries(toleratedCounts)
    .map(([actions, count]) => `${actions}×${count}`)
    .join(", ");

  console.log(
    `\n  tolerated: ${summary || "none"}` +
      `\n  refresh-detected drift (not alerted): ${drift.length} resource(s)`
  );

  if (unexpected.length === 0) {
    console.log(
      `\n✓ [${env}] No unexpected drift — live GCP matches Terraform state.\n` +
        `  No resource would be created, destroyed or replaced to reconcile them.`
    );
    writeReport(ctx, {
      status: EXIT_OK,
      toleratedCount: tolerated.length,
      driftCount: drift.length,
    });
    return EXIT_OK;
  }

  writeReport(ctx, { status: EXIT_DRIFT, unexpected });

  console.error(`\n✖ [${env}] TERRAFORM DRIFT DETECTED — ${unexpected.length} resource(s)`);
  console.error(
    `\n  These would be created, destroyed or replaced to make reality match state.\n` +
      `  Resources vanishing from GCP is the signature of the 2026-07-27 outage.\n`
  );

  const external = unexpected.filter((u) => u.evidence === "external-change");
  const configOnly = unexpected.filter((u) => u.evidence !== "external-change");

  if (external.length > 0) {
    console.error(`  Corroborated by refresh — changed outside Terraform (${external.length}):`);
    external.forEach((u) => console.error(`    ${JSON.stringify(u.actions)}  ${u.address}`));
  }
  if (configOnly.length > 0) {
    console.error(
      `\n  Not seen by refresh — likely unapplied config or state/config mismatch (${configOnly.length}):`
    );
    configOnly.forEach((u) => console.error(`    ${JSON.stringify(u.actions)}  ${u.address}`));
  }

  console.error(
    `\n  Investigate before applying anything:\n` +
      `    cd terraform && terraform plan -var-file=${env}.tfvars\n\n` +
      `  Runbook: docs/runbooks/2026-07-27-dev-fleet-lb-recovery.md`
  );
  return EXIT_DRIFT;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(checkDrift({ env: process.argv[2] }));
}
