// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// #203: a verification status is only worth publishing if it CANNOT survive a
// definition change. These tests pin the demotion, and they do it against real
// tools booted from a real server with real `definitionHash` values rather than
// hand-written fixtures — a reconstructed hash would let the binding drift from
// `computeDefinitionHash` without any test noticing.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { toManifestEntry } from "./manifest.mjs";
import {
  loadLedger,
  parseLedger,
  ledgerPath,
  resolveVerification,
  assertVerificationBinding,
  DEFAULT_VERIFICATION,
} from "./verification-ledger.mjs";

/** A real governed tool, so the hash under test is a real definitionHash. */
async function aGovernedTool() {
  const tools = await withServerClient("ttd-mcp", listRawTools);
  const tool = tools.find((t) => t.annotations?.cesteral);
  expect(tool, "ttd-mcp should advertise at least one governed tool").toBeTruthy();
  return tool;
}

describe("a tool cannot promote itself", () => {
  it("ships `declared` when the ledger is omitted entirely", async () => {
    const entry = toManifestEntry(await aGovernedTool());
    expect(entry.verification).toEqual(DEFAULT_VERIFICATION);
  });

  it("ignores a status planted in the tool's own cesteral annotation", async () => {
    const tool = await aGovernedTool();
    const selfPromoting = {
      ...tool,
      annotations: {
        ...tool.annotations,
        cesteral: { ...tool.annotations.cesteral, verification: { status: "live-verified" } },
      },
    };
    // The annotation is not a source of verification. (It DOES change the hash,
    // which is its own defence — but the status must not leak through either.)
    const entry = toManifestEntry(selfPromoting);
    expect(entry.verification.status).toBe("declared");
  });
});

describe("demotion on definition change", () => {
  it("promotes when the bound hash matches the shipped definition", async () => {
    const tool = await aGovernedTool();
    const { definitionHash } = toManifestEntry(tool);

    const entry = toManifestEntry(tool, {
      [tool.name]: {
        status: "live-verified",
        verifiedDefinitionHash: definitionHash,
        verifiedAt: "2026-09-16",
        evidence: "docs/plans/example.md#tool",
      },
    });

    expect(entry.verification.status).toBe("live-verified");
    expect(entry.verification.verifiedDefinitionHash).toBe(definitionHash);
    expect(entry.verification.demotedFrom).toBeUndefined();
  });

  it("DEMOTES when the definition changes under a previously-verified claim", async () => {
    const tool = await aGovernedTool();
    const { definitionHash: originalHash } = toManifestEntry(tool);

    // A real definition change: edit the description, which definitionHash covers.
    const changed = { ...tool, description: `${tool.description} (revised)` };
    const changedHash = toManifestEntry(changed).definitionHash;
    expect(changedHash, "the edit must actually move the hash").not.toBe(originalHash);

    // The ledger still carries yesterday's claim, bound to yesterday's hash.
    const ledger = {
      [tool.name]: {
        status: "live-verified",
        verifiedDefinitionHash: originalHash,
        verifiedAt: "2026-09-16",
        evidence: "docs/plans/example.md#tool",
      },
    };

    const entry = toManifestEntry(changed, ledger);
    expect(entry.verification.status).toBe("declared");
    expect(entry.verification.demotedFrom).toBe("live-verified");
    // The stale hash must NOT ship beside the new definition.
    expect(entry.verification.verifiedDefinitionHash).toBeUndefined();
  });

  it("records what was demoted, so a stale report is distinguishable from an untested tool", () => {
    const untested = resolveVerification(undefined, "a".repeat(64));
    const demoted = resolveVerification(
      { status: "live-verified", verifiedDefinitionHash: "b".repeat(64), evidence: "x" },
      "a".repeat(64)
    );
    expect(untested.status).toBe("declared");
    expect(demoted.status).toBe("declared");
    // Same status, different provenance — one of them has a report to re-run.
    expect(untested.demotedFrom).toBeUndefined();
    expect(demoted.demotedFrom).toBe("live-verified");
  });

  it("demotes fixture-verified on the same rule", () => {
    const r = resolveVerification(
      { status: "fixture-verified", verifiedDefinitionHash: "c".repeat(64), evidence: "t.test.ts" },
      "d".repeat(64)
    );
    expect(r.status).toBe("declared");
    expect(r.demotedFrom).toBe("fixture-verified");
  });

  it("leaves `disabled` intact, because it makes no claim about a definition", () => {
    const r = resolveVerification(
      { status: "disabled", reason: "platform removed it" },
      "e".repeat(64)
    );
    expect(r.status).toBe("disabled");
    expect(r.reason).toBe("platform removed it");
  });
});

describe("the release gate", () => {
  it("rejects a manifest whose claim is bound to a different hash", () => {
    const manifest = {
      packageName: "@cesteral/x-mcp",
      tools: [
        {
          toolName: "x_delete_entity",
          definitionHash: "a".repeat(64),
          verification: {
            status: "live-verified",
            verifiedDefinitionHash: "b".repeat(64),
          },
        },
      ],
    };
    expect(() => assertVerificationBinding(manifest)).toThrow(/bound to b{64} but shipping a{64}/);
  });

  it("accepts a matching claim, and ignores declared entries", () => {
    const hash = "a".repeat(64);
    expect(() =>
      assertVerificationBinding({
        packageName: "@cesteral/x-mcp",
        tools: [
          {
            toolName: "ok",
            definitionHash: hash,
            verification: { status: "live-verified", verifiedDefinitionHash: hash },
          },
          { toolName: "plain", definitionHash: hash, verification: { status: "declared" } },
          { toolName: "none", definitionHash: hash },
        ],
      })
    ).not.toThrow();
  });
});

describe("ledger files are well-formed and honest", () => {
  const packages = readdirSync(join(ROOT, "packages"))
    .filter((p) => p.endsWith("-mcp"))
    .sort();

  it.each(packages)("%s: ledger parses, or is legitimately absent", (pkg) => {
    expect(() => loadLedger(pkg)).not.toThrow();
  });

  it("rejects a verified status with no bound hash", () => {
    // The rule that makes the whole field trustworthy, asserted at load time so
    // a bad ledger fails the build rather than shipping an unbindable claim.
    expect(() => parseLedger({ tools: { t: { status: "live-verified", evidence: "x" } } })).toThrow(
      /verifiedDefinitionHash/
    );
  });

  it("rejects a verified status with a bound hash but no evidence", () => {
    expect(() =>
      parseLedger({
        tools: { t: { status: "live-verified", verifiedDefinitionHash: "a".repeat(64) } },
      })
    ).toThrow(/evidence/);
  });

  it("rejects a disabled status with no reason", () => {
    expect(() => parseLedger({ tools: { t: { status: "disabled" } } })).toThrow(/reason/);
  });

  it("rejects an unknown status rather than treating it as declared", () => {
    expect(() => parseLedger({ tools: { t: { status: "probably-fine" } } })).toThrow(
      /expected one of/
    );
  });

  it.each(packages.filter((p) => existsSync(ledgerPath(p))))(
    "%s: every ledger tool name is a tool the server actually advertises",
    async (pkg) => {
      const ledger = loadLedger(pkg);
      const live = new Set((await withServerClient(pkg, listRawTools)).map((t) => t.name));
      const unknown = Object.keys(ledger).filter((name) => !live.has(name));
      expect(unknown, `${pkg}: ledger names tools that do not exist`).toEqual([]);
    }
  );

  it.each(packages.filter((p) => existsSync(ledgerPath(p))))(
    "%s: no ledger entry claims verification without recorded evidence",
    (pkg) => {
      const raw = JSON.parse(readFileSync(ledgerPath(pkg), "utf-8"));
      for (const [name, entry] of Object.entries(raw.tools ?? {})) {
        if (entry.status === "fixture-verified" || entry.status === "live-verified") {
          expect(entry.evidence, `${pkg}:${name}`).toBeTruthy();
          expect(entry.verifiedDefinitionHash, `${pkg}:${name}`).toMatch(/^[0-9a-f]{64}$/);
        }
      }
    }
  );
});
