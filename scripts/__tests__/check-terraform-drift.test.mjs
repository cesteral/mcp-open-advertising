import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  classifyPlan,
  checkDrift,
  findPreexistingChanges,
  isSupportedFormatVersion,
  renderReport,
  tallyActions,
  EXIT_OK,
  EXIT_DRIFT,
  EXIT_CANNOT_CHECK,
} from "../check-terraform-drift.mjs";

/**
 * Unit tests for the Terraform drift checker (runbook
 * 2026-07-27-dev-fleet-lb-recovery). The live plan is exercised by the
 * scheduled job; here we pin the decision logic against already-resolved facts,
 * and — most importantly — pin the failure handling that let the original
 * outage hide for a week.
 */

function change(address, actions) {
  return { address, change: { actions } };
}

function plan({ changes = [], drift = [], formatVersion = "1.2" } = {}) {
  return {
    format_version: formatVersion,
    resource_changes: changes,
    resource_drift: drift,
  };
}

describe("classifyPlan — alerting actions", () => {
  /**
   * The outage signature. GCP reclaimed 43 resources; state still listed them,
   * so the recovery plan carried 68 creates. A create is "state believes in a
   * resource that is not there".
   */
  it("alerts on create", () => {
    const v = classifyPlan(
      plan({ changes: [change("module.fleet_lb.google_compute_global_address.fleet", ["create"])] })
    );
    expect(v.ok).toBe(true);
    expect(v.unexpected).toHaveLength(1);
    expect(v.unexpected[0].address).toContain("global_address");
  });

  it("alerts on delete", () => {
    const v = classifyPlan(
      plan({ changes: [change("module.networking.google_compute_router_nat.nat", ["delete"])] })
    );
    expect(v.unexpected).toHaveLength(1);
  });

  /**
   * Terraform spells replace two ways specifically so callers can scan for
   * "delete". Both orderings must alert — missing one silently tolerates a
   * resource being destroyed and rebuilt.
   */
  it.each([[["delete", "create"]], [["create", "delete"]]])(
    "alerts on replace spelled %j",
    (actions) => {
      const v = classifyPlan(
        plan({
          changes: [change("module.fleet_lb.google_compute_backend_service.service", actions)],
        })
      );
      expect(v.unexpected).toHaveLength(1);
      expect(v.unexpected[0].actions).toEqual(actions);
    }
  );
});

describe("classifyPlan — tolerated actions", () => {
  /**
   * The trap that manufactured a phantom blocker during the recovery. Filtering
   * on `actions != ["no-op"]` sweeps in data-source refreshes, which made 13
   * refreshing google_secret_manager_secret data sources look like 13 creates
   * of the same secret ID — an ALREADY_EXISTS blocker that did not exist.
   */
  it("tolerates read — a data-source refresh is not a create", () => {
    const v = classifyPlan(
      plan({
        changes: Array.from({ length: 13 }, (_, i) =>
          change(`data.google_secret_manager_secret.existing["s${i}"]`, ["read"])
        ),
      })
    );
    expect(v.unexpected).toEqual([]);
    expect(v.tolerated).toHaveLength(13);
  });

  it("tolerates no-op and in-place update", () => {
    const v = classifyPlan(
      plan({
        changes: [
          change("google_artifact_registry_repository.container_repo", ["no-op"]),
          change("module.monitoring.google_monitoring_dashboard.cesteral", ["update"]),
        ],
      })
    );
    expect(v.unexpected).toEqual([]);
    expect(v.tolerated).toHaveLength(2);
  });

  /**
   * Measured against live dev state on 2026-08-03: 239 no-ops, 1 dashboard
   * update, 0 creates/deletes, and 49 resource_drift entries that were all
   * provider normalization (null -> [], null -> {}, server-computed
   * expire_time). Alerting on any of that would fire on every run forever —
   * the crying-wolf mode that hid the outage. This pins the real baseline as
   * clean.
   */
  it("reports the measured steady-state baseline as clean", () => {
    const v = classifyPlan(
      plan({
        changes: [
          ...Array.from({ length: 239 }, (_, i) => change(`res.no_op_${i}`, ["no-op"])),
          change("module.monitoring.google_monitoring_dashboard.cesteral", ["update"]),
        ],
        drift: Array.from({ length: 49 }, (_, i) => ({
          address: `module.fleet_lb.noise_${i}`,
          change: { actions: ["update"] },
        })),
      })
    );
    expect(v.unexpected).toEqual([]);
    expect(v.drift).toHaveLength(49);
  });
});

describe("classifyPlan — drift corroboration is advisory", () => {
  it("labels an alerting address that refresh also saw change", () => {
    const address = "module.networking.google_compute_firewall.allow_health_checks";
    const v = classifyPlan(
      plan({
        changes: [change(address, ["create"])],
        drift: [{ address, change: { actions: ["delete"] } }],
      })
    );
    expect(v.unexpected[0].evidence).toBe("external-change");
  });

  /**
   * The JSON format docs do not guarantee a remotely-deleted object appears in
   * resource_drift. So an address missing from drift must still alert — it only
   * loses its label. Correctness cannot depend on undocumented behaviour.
   */
  it("still alerts when refresh did not report the address", () => {
    const v = classifyPlan(
      plan({ changes: [change("module.fleet_lb.google_compute_url_map.fleet", ["create"])] })
    );
    expect(v.unexpected).toHaveLength(1);
    expect(v.unexpected[0].evidence).toBe("config-or-state");
  });

  it("tolerates a plan with no resource_drift key at all", () => {
    const v = classifyPlan({ format_version: "1.2", resource_changes: [] });
    expect(v.ok).toBe(true);
    expect(v.drift).toEqual([]);
  });
});

describe("classifyPlan — fails closed on unfamiliar shapes", () => {
  it("refuses an unsupported major format_version", () => {
    const v = classifyPlan(plan({ formatVersion: "2.0" }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("format_version");
  });

  it.each([undefined, null, 1.2, ""])("refuses non-1.x format_version %p", (fv) => {
    expect(isSupportedFormatVersion(fv)).toBe(false);
  });

  it("accepts the observed 1.2 and other 1.x", () => {
    expect(isSupportedFormatVersion("1.2")).toBe(true);
    expect(isSupportedFormatVersion("1.9")).toBe(true);
  });

  it("refuses a plan with no resource_changes array", () => {
    const v = classifyPlan({ format_version: "1.2" });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("resource_changes");
  });

  /**
   * A future Terraform action must never be silently bucketed as tolerated —
   * that would turn an unknown destructive operation into a clean run.
   */
  it("refuses an action array outside the documented seven", () => {
    const v = classifyPlan(plan({ changes: [change("res.x", ["forget"])] }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("unrecognized action array");
  });

  it("refuses a malformed resource_changes entry", () => {
    const v = classifyPlan(plan({ changes: [{ address: "res.x" }] }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("malformed");
  });

  it("refuses an entry whose address is missing or not a string", () => {
    expect(classifyPlan(plan({ changes: [{ change: { actions: ["create"] } }] })).ok).toBe(false);
    expect(classifyPlan(plan({ changes: [change(42, ["create"])] })).ok).toBe(false);
    expect(classifyPlan(plan({ changes: [change("", ["create"])] })).ok).toBe(false);
  });

  /**
   * The action set must be keyed on JSON.stringify, not join(",").
   *
   * join is lossy: the malformed SINGLE-element array ["delete,create"] joins to
   * the same "delete,create" string as the legitimate two-element
   * ["delete","create"]. Under join-keying it passed validation, and then
   * classified as TOLERATED — `includes("delete")` is false when the comma is
   * inside the element — so a destructive-looking plan reported clean.
   */
  it("refuses a comma-containing action element instead of colliding with replace", () => {
    const v = classifyPlan(plan({ changes: [change("res.x", ["delete,create"])] }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("unrecognized action array");
  });

  it.each([
    [["create", "create"]],
    [["no-op", "update"]],
    [["delete", "create", "delete"]],
    [[]],
    [["CREATE"]],
    [[["delete"]]],
    [[null]],
  ])("refuses the undocumented action array %j", (actions) => {
    expect(classifyPlan(plan({ changes: [change("res.x", actions)] })).ok).toBe(false);
  });

  it("refuses a non-object plan", () => {
    expect(classifyPlan(null).ok).toBe(false);
    expect(classifyPlan("").ok).toBe(false);
  });
});

describe("classifyPlan — failure reasons never echo plan content", () => {
  /**
   * Failure reasons are written to the report file and from there into a public
   * GitHub issue. Serializing the offending entry would put before/after
   * attribute values there, contradicting the addresses-and-actions-only
   * guarantee the rest of the pipeline maintains.
   */
  const SENTINEL = "SENSITIVE-VALUE-must-never-reach-an-issue";

  it("omits before/after values from a malformed-entry reason", () => {
    const v = classifyPlan(
      plan({
        changes: [
          {
            address: "module.x.google_secret_manager_secret.s",
            change: { actions: "not-an-array", before: { password: SENTINEL }, after: SENTINEL },
          },
        ],
      })
    );
    expect(v.ok).toBe(false);
    expect(v.reason).not.toContain(SENTINEL);
    expect(v.reason).toContain("resource_changes[0]");
  });

  it("omits values when the address itself is missing", () => {
    const v = classifyPlan(
      plan({ changes: [{ change: { actions: ["create"], after: { token: SENTINEL } } }] })
    );
    expect(v.ok).toBe(false);
    expect(v.reason).not.toContain(SENTINEL);
    expect(v.reason).toContain("resource_changes[0]");
  });

  it("does not echo a non-keyword action element verbatim", () => {
    const v = classifyPlan(plan({ changes: [change("res.x", [SENTINEL])] }));
    expect(v.ok).toBe(false);
    expect(v.reason).not.toContain(SENTINEL);
    expect(v.reason).toContain("<invalid>");
  });
});

describe("findPreexistingChanges", () => {
  it("finds dirty terraform files and ignores everything else", () => {
    const porcelain = [
      " M terraform/main.tf",
      " M .gitignore",
      "?? terraform/drift-check.tf",
      "",
    ].join("\n");
    expect(findPreexistingChanges(porcelain)).toEqual([
      "terraform/main.tf",
      "terraform/drift-check.tf",
    ]);
  });

  it("returns nothing for a clean tree", () => {
    expect(findPreexistingChanges("")).toEqual([]);
  });
});

describe("tallyActions", () => {
  it("counts by action array", () => {
    const counts = tallyActions([
      { actions: ["no-op"] },
      { actions: ["no-op"] },
      { actions: ["update"] },
    ]);
    expect(counts).toEqual({ '["no-op"]': 2, '["update"]': 1 });
  });
});

describe("renderReport", () => {
  /**
   * The workflow deduplicates issues on this marker rather than on the title,
   * so the title can change between "drift detected" and "could not check"
   * without orphaning the open issue and leaving a stale one behind.
   */
  it.each([EXIT_OK, EXIT_DRIFT, EXIT_CANNOT_CHECK])(
    "emits the stable dedup marker for status %i",
    (status) => {
      const body = renderReport("dev", {
        status,
        reason: "boom",
        unexpected: [{ address: "res.a", actions: ["create"], evidence: "external-change" }],
        toleratedCount: 0,
        driftCount: 0,
      });
      expect(body).toContain("<!-- terraform-drift:dev -->");
    }
  );

  it("separates externally-changed from config-only addresses", () => {
    const body = renderReport("dev", {
      status: EXIT_DRIFT,
      unexpected: [
        {
          address: "module.networking.google_compute_router_nat.nat",
          actions: ["create"],
          evidence: "external-change",
        },
        { address: "module.new.thing", actions: ["create"], evidence: "config-or-state" },
      ],
    });
    expect(body).toContain("Changed outside Terraform (1)");
    expect(body).toContain("Not seen by refresh (1)");
    expect(body).toContain("google_compute_router_nat.nat");
  });

  /**
   * A "could not check" run must never read as reassuring — that ambiguity is
   * what the exit-code split exists to remove.
   */
  it("states plainly that a failed check is not a clean result", () => {
    const body = renderReport("dev", { status: EXIT_CANNOT_CHECK, reason: "init failed" });
    expect(body).toContain("could not check");
    expect(body).toContain("not a clean result");
  });

  it("marks a clean run clean and reports tolerated counts", () => {
    const body = renderReport("dev", { status: EXIT_OK, toleratedCount: 240, driftCount: 49 });
    expect(body).toContain("clean");
    expect(body).toContain("240");
    expect(body).toContain("49");
  });
});

describe("report file — issue bodies carry addresses, never terraform stderr", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tf-drift-test-"));

  it("omits terraform stderr from the report written for the issue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tf-drift-report-"));
    const reportFile = path.join(dir, "report.md");
    const secretish = "SENSITIVE-PLAN-DETAIL-should-never-reach-an-issue";

    const runner = (cmd, args) => {
      if (cmd === "git") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "plan") return { status: 1, stdout: "", stderr: secretish };
      return { status: 0, stdout: "", stderr: "" };
    };

    const code = checkDrift({
      env: "dev",
      runner,
      makeTempDir: tmp,
      exists: () => true,
      reportFile,
    });

    expect(code).toBe(EXIT_CANNOT_CHECK);
    const body = fs.readFileSync(reportFile, "utf8");
    expect(body).not.toContain(secretish);
    expect(body).toContain("<!-- terraform-drift:dev -->");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("checkDrift — an empty result is never a clean result", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tf-drift-test-"));
  const clean = { status: 0, stdout: "", stderr: "" };
  const existsAlways = () => true;

  /**
   * The invariant these tests defend: emptiness is never evidence of a clean
   * result. Both halves of it are covered, because the failure has two shapes.
   *
   * The incident's shape was exit 0 WITH empty output — `terraform state list`
   * returns nothing and succeeds when the token has expired. That produced two
   * wrong conclusions, including a runbook claim that module.monitoring had
   * never been applied when it in fact held ~69 resources. That shape is
   * covered by "show succeeds but returns empty output" below: an empty body
   * fails to parse and reports "could not check" rather than "no changes".
   *
   * This test covers the other shape: a NONZERO exit carrying no diagnostics at
   * all. The checker must key on the exit code and refuse, rather than fall
   * through to a verdict because there was nothing in stderr to complain about.
   */
  it("exits 2 when terraform fails with empty stdout and empty stderr", () => {
    for (const failingStep of ["init", "plan", "show"]) {
      const runner = (cmd, args) => {
        if (cmd === "git") return { status: 0, stdout: "", stderr: "" };
        if (args[0] === failingStep) return { status: 1, stdout: "", stderr: "" };
        return clean;
      };
      const code = checkDrift({ env: "dev", runner, makeTempDir: tmp, exists: existsAlways });
      expect(code, `${failingStep} failure must not read as clean`).toBe(EXIT_CANNOT_CHECK);
    }
  });

  /**
   * The subtler sibling: every command "succeeds" but show produces nothing.
   * Empty stdout parses as no plan at all, which must not be a pass.
   */
  it("exits 2 when show succeeds but returns empty output", () => {
    const runner = (cmd) => (cmd === "git" ? { status: 0, stdout: "" } : clean);
    expect(checkDrift({ env: "dev", runner, makeTempDir: tmp, exists: existsAlways })).toBe(
      EXIT_CANNOT_CHECK
    );
  });

  it("exits 2 when git status itself fails", () => {
    const runner = (cmd) =>
      cmd === "git" ? { status: 128, stdout: "", stderr: "not a repo" } : clean;
    expect(checkDrift({ env: "dev", runner, makeTempDir: tmp, exists: existsAlways })).toBe(
      EXIT_CANNOT_CHECK
    );
  });

  it("exits 2 on a dirty terraform tree rather than misattributing the diff", () => {
    const runner = (cmd) =>
      cmd === "git" ? { status: 0, stdout: " M terraform/main.tf\n", stderr: "" } : clean;
    expect(checkDrift({ env: "dev", runner, makeTempDir: tmp, exists: existsAlways })).toBe(
      EXIT_CANNOT_CHECK
    );
  });

  it("exits 2 when the env config files are missing", () => {
    expect(
      checkDrift({ env: "dev", runner: () => clean, makeTempDir: tmp, exists: () => false })
    ).toBe(EXIT_CANNOT_CHECK);
  });

  it.each([undefined, "", "../evil", "DEV"])("exits 2 for invalid env %p", (env) => {
    expect(checkDrift({ env, runner: () => clean, makeTempDir: tmp, exists: existsAlways })).toBe(
      EXIT_CANNOT_CHECK
    );
  });
});

describe("checkDrift — end-to-end verdicts through the injected runner", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tf-drift-test-"));
  const existsAlways = () => true;

  function runnerFor(planJson) {
    return (cmd, args) => {
      if (cmd === "git") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "show") return { status: 0, stdout: JSON.stringify(planJson), stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
  }

  it("exits 0 on the clean baseline", () => {
    const code = checkDrift({
      env: "dev",
      runner: runnerFor(plan({ changes: [change("res.a", ["no-op"])] })),
      makeTempDir: tmp,
      exists: existsAlways,
    });
    expect(code).toBe(EXIT_OK);
  });

  /**
   * The outage, replayed: the fleet LB and networking resources are in state but
   * gone from GCP, so the plan wants to create them back.
   */
  it("exits 1 when reclaimed infrastructure would be recreated", () => {
    const reclaimed = [
      "module.fleet_lb[0].google_compute_global_address.fleet",
      "module.fleet_lb[0].google_compute_url_map.fleet",
      "module.networking.google_compute_router_nat.nat",
      "module.networking.google_compute_firewall.allow_external_apis[0]",
    ];
    const code = checkDrift({
      env: "dev",
      runner: runnerFor(
        plan({
          changes: reclaimed.map((a) => change(a, ["create"])),
          drift: reclaimed.map((address) => ({ address, change: { actions: ["delete"] } })),
        })
      ),
      makeTempDir: tmp,
      exists: existsAlways,
    });
    expect(code).toBe(EXIT_DRIFT);
  });

  it("exits 2 rather than 1 when the plan JSON is unparseable", () => {
    const runner = (cmd, args) => {
      if (cmd === "git") return { status: 0, stdout: "", stderr: "" };
      if (args[0] === "show") return { status: 0, stdout: "{not json", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    expect(checkDrift({ env: "dev", runner, makeTempDir: tmp, exists: existsAlways })).toBe(
      EXIT_CANNOT_CHECK
    );
  });
});
