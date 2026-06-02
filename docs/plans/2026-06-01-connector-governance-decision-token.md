# Connector Governance: Decision-Token Verification + Write-Contract Coverage — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify Intelligence-minted `X-Cesteral-Decision-Token` on every governed write `tools/call`, and expand `cesteral` contracts/structured responses to all 122 production write tools — warn-only first, enforce per-contract later.

**Architecture:** Three layers. (1) `@cesteral/contract-hash` owns canonical bytes (`stableStringify`, `hashActionInput`, `canonicalizeExecutableArgs`) — the single cross-repo source of truth. (2) `@cesteral/shared` owns enforcement: a decision-token verifier + pluggable `JtiStore` + three-tier mode config + audit, invoked from `tool-handler-factory` gated to `cesteral.kind === "write"`. (3) Annotation/response surface gains a `writeClass: "entity" | "effect"` discriminated migration, then expands across all servers.

**Tech Stack:** TypeScript (ES2022, ESM), pnpm + Turborepo, Vitest, Zod, Hono transport, Pino, OTEL. JWT via `jose` (already a transitive dep through auth — confirm in Task 9; otherwise add).

**Design doc:** `docs/plans/2026-06-01-connector-governance-decision-token-design.md`

**Scope of THIS plan:** PR 1 (foundations + schema migration) is fully detailed and bite-sized. PRs 2–N (per-tool contract expansion) are repetitive applications of one template — given as task templates at the end. Do PR 1 end-to-end and ship it (no default behavior change) before generating per-batch plans for PRs 2–N.

**Conventions:**
- Tests mirror `src/` under `packages/<pkg>/tests/`. Run a single package's tests with `pnpm --filter @cesteral/<pkg> test`.
- Rebuild dependents after touching shared/contract-hash: `pnpm run build`.
- TDD: failing test → run-fail → minimal impl → run-pass → commit. One commit per task.
- No backward-compat shims (repo rule). `writeClass` is a hard migration, not additive.

---

## PR 1 — Foundations + schema migration (global default `off`, zero behavior change)

### Task 1: `stableStringify` in `@cesteral/contract-hash`

**Files:**
- Modify: `packages/contract-hash/src/index.ts`
- Test: `packages/contract-hash/tests/stable-stringify.test.ts` (create)

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { stableStringify } from "../src/index.js";

describe("stableStringify", () => {
  it("sorts object keys deeply and is order-invariant", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(stableStringify({ a: { c: 3, d: 2 }, b: 1 })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it("preserves array element order but sorts nested object keys", () => {
    expect(stableStringify([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]');
  });
  it("drops undefined object properties (JSON semantics)", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
  it("emits null and empty containers", () => {
    expect(stableStringify({ a: null, b: [], c: {} })).toBe('{"a":null,"b":[],"c":{}}');
  });
  it("THROWS on non-JSON values rather than coercing", () => {
    expect(() => stableStringify(NaN)).toThrow(/JSON/i);
    expect(() => stableStringify(Infinity)).toThrow(/JSON/i);
    expect(() => stableStringify(10n)).toThrow(/BigInt/i);
    expect(() => stableStringify(new Date(0))).toThrow(/Date/i);
    expect(() => stableStringify(() => 1)).toThrow(/function/i);
    expect(() => stableStringify(Symbol("x"))).toThrow(/symbol/i);
  });
  it("THROWS on root undefined (JSON.stringify(undefined) === undefined would violate :string)", () => {
    expect(() => stableStringify(undefined)).toThrow(/undefined/i);
  });
  it("drops undefined object props but rejects undefined array elements", () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(() => stableStringify([undefined])).toThrow(/undefined/i);
  });
});
```

**Step 2: Run to verify it fails**
Run: `pnpm --filter @cesteral/contract-hash test stable-stringify`
Expected: FAIL — `stableStringify is not a function`.

**Step 3: Minimal implementation** (in `packages/contract-hash/src/index.ts`, reuse existing `sortKeysDeep`)

```ts
/**
 * Canonical JSON string: deep key-sorted, JSON-compatible ONLY.
 * Throws on BigInt / Date / NaN / Infinity / function / symbol / class instance
 * rather than silently coercing — Zod output may not be JSON, and a silent
 * coercion would diverge from governance-layer's stableStringify.
 * Must stay byte-identical with cesteral-governance-layer (lib/features/governance/utils.ts).
 */
export function stableStringify(value: unknown): string {
  // Root undefined must throw: JSON.stringify(undefined) returns `undefined`,
  // which would violate the `: string` return type and make hashActionInput
  // fail downstream in confusing ways.
  if (typeof value === "undefined") {
    throw new Error("stableStringify: undefined is not valid JSON at the root");
  }
  return JSON.stringify(sortKeysDeep(assertJsonCompatible(value)));
}

function assertJsonCompatible(value: unknown): unknown {
  const t = typeof value;
  if (t === "bigint") throw new Error("stableStringify: BigInt is not JSON-serializable");
  if (t === "function") throw new Error("stableStringify: function is not JSON-serializable");
  if (t === "symbol") throw new Error("stableStringify: symbol is not JSON-serializable");
  if (t === "number" && !Number.isFinite(value as number))
    throw new Error("stableStringify: NaN/Infinity are not valid JSON");
  if (value !== null && t === "object") {
    if (value instanceof Date) throw new Error("stableStringify: Date is not JSON-serializable");
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
      throw new Error("stableStringify: class instance is not JSON-serializable");
    if (Array.isArray(value)) {
      // JSON.stringify coerces undefined array elements to null — reject rather
      // than silently coerce, since governance must hash the same bytes.
      value.forEach((el) => {
        if (typeof el === "undefined")
          throw new Error("stableStringify: undefined array element is not valid JSON");
        assertJsonCompatible(el);
      });
    } else {
      // Object properties: undefined is DROPPED by JSON.stringify (valid JSON
      // semantics) — skip, do not throw. Only recurse into present values.
      for (const v of Object.values(value as Record<string, unknown>)) {
        if (typeof v === "undefined") continue;
        assertJsonCompatible(v);
      }
    }
  }
  return value;
}
```

**Step 4: Run to verify it passes**
Run: `pnpm --filter @cesteral/contract-hash test stable-stringify` → PASS.

**Step 5: Commit**
```bash
git add packages/contract-hash/src/index.ts packages/contract-hash/tests/stable-stringify.test.ts
git commit -m "feat(contract-hash): JSON-only stableStringify (shared canonical bytes)"
```

---

### Task 2: `hashActionInput` in `@cesteral/contract-hash`

**Files:**
- Modify: `packages/contract-hash/src/index.ts`
- Test: `packages/contract-hash/tests/hash-action-input.test.ts` (create)

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { hashActionInput, stableStringify } from "../src/index.js";
import { createHash } from "node:crypto";

describe("hashActionInput", () => {
  it("is sha256 over stableStringify, lowercase hex", () => {
    const args = { campaignId: "123", status: "PAUSED" };
    const expected = createHash("sha256").update(stableStringify(args), "utf8").digest("hex");
    expect(hashActionInput(args)).toBe(expected);
    expect(hashActionInput(args)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is invariant to key ordering", () => {
    expect(hashActionInput({ a: 1, b: 2 })).toBe(hashActionInput({ b: 2, a: 1 }));
  });
});
```

**Step 2: Run-fail** → `hashActionInput is not a function`.

**Step 3: Implement**
```ts
export function hashActionInput(value: unknown): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}
```
(`createHash` is already imported at top of the file for `computeDefinitionHash`.)

**Step 4: Run-pass.**

**Step 5: Commit**
```bash
git commit -am "feat(contract-hash): hashActionInput = sha256(stableStringify(args))"
```

---

### Task 3: `canonicalizeExecutableArgs` in `@cesteral/contract-hash`

Hashes the **raw wire args minus declared control fields** (see design §5 — avoids Zod-default/coercion divergence with governance).

**Files:**
- Modify: `packages/contract-hash/src/index.ts`
- Test: `packages/contract-hash/tests/canonicalize-executable-args.test.ts` (create)

**Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { canonicalizeExecutableArgs, hashActionInput } from "../src/index.js";

describe("canonicalizeExecutableArgs", () => {
  it("strips top-level control fields before hashing", () => {
    const raw = { customerId: "1", entityId: "2", data: { status: "PAUSED" }, dry_run: true };
    const canon = canonicalizeExecutableArgs({ rawArgs: raw, exclude: ["dry_run"] });
    expect(canon).toEqual({ customerId: "1", entityId: "2", data: { status: "PAUSED" } });
  });
  it("leaves args untouched when nothing is excluded", () => {
    const raw = { a: 1, b: 2 };
    expect(canonicalizeExecutableArgs({ rawArgs: raw, exclude: [] })).toEqual(raw);
  });
  it("produces an order-invariant hash", () => {
    const a = canonicalizeExecutableArgs({ rawArgs: { b: 2, a: 1, dry_run: false }, exclude: ["dry_run"] });
    const b = canonicalizeExecutableArgs({ rawArgs: { a: 1, b: 2 }, exclude: [] });
    expect(hashActionInput(a)).toBe(hashActionInput(b));
  });
  it("returns non-object args unchanged (e.g. throws downstream if non-JSON)", () => {
    expect(canonicalizeExecutableArgs({ rawArgs: "x", exclude: ["dry_run"] })).toBe("x");
  });
});
```

**Step 2: Run-fail.**

**Step 3: Implement**
```ts
/**
 * Canonical "executable write args" both connector and governance hash.
 * Hashes the raw wire arguments MINUS declared control fields (e.g. dry_run),
 * NOT the Zod-parsed output — see design §5. Only top-level control fields are
 * removed; nested values are preserved verbatim and key-sorted at hash time.
 */
export function canonicalizeExecutableArgs(opts: { rawArgs: unknown; exclude: string[] }): unknown {
  const { rawArgs, exclude } = opts;
  if (rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs)) return rawArgs;
  if (exclude.length === 0) return rawArgs;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawArgs as Record<string, unknown>)) {
    if (!exclude.includes(k)) out[k] = v;
  }
  return out;
}
```

**Step 4: Run-pass.**

**Step 5: Commit**
```bash
git commit -am "feat(contract-hash): canonicalizeExecutableArgs (wire args minus control fields)"
```

---

### Task 4: Golden action-hash vectors

**Files:**
- Create: `packages/contract-hash/tests/golden-action-hashes.json`
- Test: `packages/contract-hash/tests/golden-action-hashes.test.ts`

**Step 1: Create the vectors file** (locally generated; marked unverified until governance confirms)
```json
{
  "source": "connector-pending-governance-confirmation",
  "note": "Replace with vectors generated by cesteral-governance-layer stableStringify to lock byte-compat.",
  "vectors": [
    { "input": { "b": 1, "a": 2 }, "stableString": "<FILL_BY_RUNNING_TEST>", "actionHash": "<FILL>" },
    { "input": { "customerId": "1", "entityId": "2", "data": { "status": "PAUSED" } }, "stableString": "<FILL>", "actionHash": "<FILL>" },
    { "input": { "list": [ { "y": 1, "x": 2 } ], "z": null }, "stableString": "<FILL>", "actionHash": "<FILL>" },
    { "input": { "unicode": "naïve—café", "n": 9007199254740991 }, "stableString": "<FILL>", "actionHash": "<FILL>" },
    { "input": {}, "stableString": "<FILL>", "actionHash": "<FILL>" },
    { "input": { "empty": [], "obj": {} }, "stableString": "<FILL>", "actionHash": "<FILL>" }
  ]
}
```

The `stableString` is checked-in alongside the hash so byte-level drift (not just hash drift) is diagnosable when comparing against governance.

**Step 2: Write the test**
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hashActionInput, stableStringify } from "../src/index.js";

const golden = JSON.parse(readFileSync(new URL("./golden-action-hashes.json", import.meta.url), "utf8"));

describe("golden action-hash vectors", () => {
  for (const [i, v] of golden.vectors.entries()) {
    it(`vector ${i} canonicalizes and hashes stably`, () => {
      expect(stableStringify(v.input)).toBe(v.stableString);
      expect(hashActionInput(v.input)).toBe(v.actionHash);
    });
  }
});
```

**Step 3: Generate values** — run once, read FAIL output, paste actual `stableString` AND `actionHash` into the JSON fields. Re-run → PASS. (Self-pinning step; once governance vectors arrive, replace the file and flip `source`. Asserting both bytes and hash means byte-level drift is diagnosable, not just hash drift.)

**Step 4: Run-pass.**

**Step 5: Commit**
```bash
git add packages/contract-hash/tests/golden-action-hashes.*
git commit -m "test(contract-hash): golden action-hash vectors (pending governance confirmation)"
```

---

### Task 5: `writeClass` discriminated annotation migration (`@cesteral/shared`)

**Files:**
- Modify: `packages/shared/src/types/cesteral-annotations.ts`
- Test: `packages/shared/tests/types/governance-contract.test.ts` (extend)

**Step 1: Failing test** — add cases asserting:
- An `entity` write annotation requires `readPartner`, `requiresValidation: true`, `requiresSimulation: true`, `supportsBeforeAfterSnapshot: true`, and `writeClass: "entity"`, `executableArgsExclude: string[]`.
- An `effect` write annotation omits `readPartner`, allows `requiresValidation: false`/`requiresSimulation: false`/`supportsBeforeAfterSnapshot: false`, requires `writeClass: "effect"`.
- Use `satisfies CesteralWriteToolAnnotations` compile-checks plus a runtime type-guard `isEffectWrite(a)` / `isEntityWrite(a)`.

```ts
import { isEntityWrite, isEffectWrite, type CesteralWriteToolAnnotations } from "../../src/index.js";

const entity = { kind: "write", writeClass: "entity", platform: "meta_ads",
  contractPlatformSlug: "meta", contractToolSlug: "update_entity",
  entityKinds: ["campaign"], entityIdArgs: ["entityId"], executableArgsExclude: ["dry_run"],
  schemaVersion: 1, contractId: "meta.update_entity.v1",
  operation: ["update"], readPartner: { toolName: "meta_get_entity", argMap: { entityId: "entityId" } },
  supportsDryRun: true, supportsBeforeAfterSnapshot: true,
  requiresValidation: true, requiresSimulation: true } satisfies CesteralWriteToolAnnotations;

const effect = { kind: "write", writeClass: "effect", platform: "meta_ads",
  contractPlatformSlug: "meta", contractToolSlug: "upload_image",
  entityKinds: [], entityIdArgs: [], executableArgsExclude: ["dry_run"],
  schemaVersion: 1, contractId: "meta.upload_image.v1", operation: ["upload"],
  supportsDryRun: false, supportsBeforeAfterSnapshot: false,
  requiresValidation: false, requiresSimulation: false } satisfies CesteralWriteToolAnnotations;

it("type guards discriminate writeClass", () => {
  expect(isEntityWrite(entity)).toBe(true);
  expect(isEffectWrite(effect)).toBe(true);
});
```

**Step 2: Run-fail** (types `writeClass`/`executableArgsExclude`/guards don't exist).

**Step 3: Implement the migration** in `cesteral-annotations.ts`:
- Add shared base fields `writeClass: "entity" | "effect"` and `executableArgsExclude: string[]` to the write annotation.
- Convert `CesteralWriteToolAnnotations` to a discriminated union on `writeClass`:
  - `CesteralEntityWriteAnnotations`: `writeClass: "entity"`, `readPartner` required, `requiresValidation: true`, `requiresSimulation: true`, `supportsBeforeAfterSnapshot: true`.
  - `CesteralEffectWriteAnnotations`: `writeClass: "effect"`, no `readPartner`, `requiresValidation: boolean`, `requiresSimulation: boolean`, `supportsBeforeAfterSnapshot: false`.
- Export `isEntityWrite`, `isEffectWrite` guards.
- Keep `operation` union; widen to include effect ops (`upload`, `create_schedule`, `delete_schedule`, `submit_report`, `upload_conversions`, `bulk_job`, `adjust_bids`, `delete`, etc.).

**Step 4: Run-pass** (shared package only). The discriminated union now makes all 13 existing `update_entity` annotations across servers fail to typecheck (they lack `writeClass`/`executableArgsExclude`). This is a **hard migration** — the repo rule forbids leaving compat shims, and a half-migrated repo is not shippable. Task 5b (below) is therefore **mandatory in PR 1**, not deferred.

**Step 5: Commit shared types**
```bash
git commit -am "feat(shared): writeClass-discriminated cesteral write annotations + guards"
```

---

### Task 5b (MANDATORY, PR 1): migrate the 13 existing `update_entity` annotations

The discriminated union from Task 5 breaks `pnpm run typecheck` until every existing governed write declares the new fields. PR 1 is not complete until the whole repo typechecks.

**Files:** the 13 `packages/*/src/mcp-server/tools/definitions/update-entity.tool.ts` (+ amazon-dsp `update-commitment.tool.ts` = 14 annotations total).

**Per file:**
1. Add `writeClass: "entity"` and `executableArgsExclude: ["dry_run"]` to the `cesteral` block (keep `satisfies CesteralWriteToolAnnotations`).
2. `pnpm --filter @cesteral/<server> typecheck` → clean.

**Step: full typecheck**
Run: `pnpm run typecheck` — expected clean across all packages.

**Commit**
```bash
git commit -am "refactor: declare writeClass:entity + executableArgsExclude on existing governed writes"
```

> This changes each tool's `definitionHash` (annotations are in the hash projection) — coordinated/documented in Task 17.

---

### Task 6: Nullable `canonicalEntityKind` + `effect` response schema (`@cesteral/shared`)

**Files:**
- Modify: `packages/shared/src/schemas/dry-run-result.ts`, `packages/shared/src/types/dry-run-result.ts`
- Test: `packages/shared/tests/schemas/dry-run-result.test.ts` (extend)

**Step 1: Failing test**
```ts
import { DispatchedCapabilitySchema, EffectResultSchema } from "../../src/index.js";

it("dispatchedCapability accepts null canonicalEntityKind for effect writes", () => {
  expect(DispatchedCapabilitySchema.parse({ operation: "upload", canonicalEntityKind: null }).canonicalEntityKind).toBeNull();
  expect(DispatchedCapabilitySchema.parse({ operation: "update", canonicalEntityKind: "campaign" }).canonicalEntityKind).toBe("campaign");
});
it("effect result validates an effectKind + scalar summary", () => {
  const e = EffectResultSchema.parse({ effectKind: "asset_created", summary: { assetId: "a1" } });
  expect(e.effectKind).toBe("asset_created");
});
```

**Step 2: Run-fail.**

**Step 3: Implement**
- Change `DispatchedCapabilitySchema.canonicalEntityKind` to `z.string().min(1).nullable()`; update `DispatchedCapability` type to `canonicalEntityKind: string | null`.
- Add `EffectResultSchema` = `z.object({ effectKind: z.string().min(1), summary: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])) })` and `EffectResult` type.
- Add optional `expectedEffect` to a new effect-dry-run shape OR extend `DryRunResultSchema` with an optional `expectedEffect` (design §7). Keep entity `DryRunResult` unchanged; add `EffectDryRunResultSchema` with `validationSource`/`expectedEffectSource` enums + optional `expectedEffect`.

**Step 4: Run-pass.**

**Step 5: Commit**
```bash
git commit -am "feat(shared): nullable canonicalEntityKind + effect result/dry-run schemas"
```

---

### Task 7: `assertGovernedEffectDryRun` (`@cesteral/shared`)

**Files:**
- Modify: `packages/shared/src/utils/governed-dry-run.ts`
- Test: `packages/shared/tests/utils/governed-dry-run.test.ts` (create)

**Step 1: Failing test** — asserts: a symbolic effect dry-run with `validationSource: "symbolic"` + `expectedEffectSource: "symbolic"` + `expectedEffect` passes; one with `validationSource: "none"` throws; **execute mode never throws** (a sibling `assertGovernedEffectDryRun` is dry-run-only, mirroring `assertGovernedDryRunResult`).

**Step 2: Run-fail.**

**Step 3: Implement** `assertGovernedEffectDryRun(result, toolLabel)` paralleling `assertGovernedDryRunResult`: throw `McpError(InternalError)` if `validationSource === "none"` or (`requiresSimulation` && `expectedEffectSource === "none"`). Tool decides whether to call it based on its `requiresValidation`/`requiresSimulation` flags.

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): assertGovernedEffectDryRun for effect-class writes"
```

---

### Task 8: Typed `RequestContext.decisionToken`

**Files:**
- Modify: `packages/shared/src/utils/request-context.ts`
- Test: `packages/shared/tests/request-context.test.ts` (extend)

**Step 1: Failing test**
```ts
it("carries an optional typed decisionToken", () => {
  const ctx = createRequestContext("svc");
  ctx.decisionToken = "eyJ...";
  expect(runWithRequestContext(ctx, async () => getRequestContext()?.decisionToken)).resolves.toBe("eyJ...");
});
```

**Step 2: Run-fail** (type error — `decisionToken` not on interface).

**Step 3: Implement** — add `decisionToken?: string;` to the `RequestContext` interface (above the index signature).

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): typed RequestContext.decisionToken"
```

---

### Task 9: Three-tier mode config (`@cesteral/shared/src/governance/config.ts`)

First, confirm a JWT lib: `grep -r "from \"jose\"" packages/shared/src` — auth already uses `jose`. Reuse it.

**Files:**
- Create: `packages/shared/src/governance/config.ts`
- Test: `packages/shared/tests/governance/config.test.ts`

**Step 1: Failing test** — `resolveTokenMode({ contractId, env })`:
- default (no env) → `"off"`.
- `GOVERNANCE_TOKEN_MODE=warn` → `"warn"` for any contract.
- per-contract override `GOVERNANCE_TOKEN_MODE_ENFORCE_CONTRACTS="meta.update_entity.v1"` → `"enforce"` for that id, base mode otherwise.
- per-contract `..._WARN_CONTRACTS` similarly.
- precedence: per-contract > base.

**Step 2: Run-fail. Step 3: Implement** pure function reading `process.env` (or an injected map for tests). Modes: `"off" | "warn" | "enforce"`.

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): three-tier decision-token mode resolution"
```

---

### Task 10: `JtiStore` interface + `InMemoryJtiStore`

**Files:**
- Create: `packages/shared/src/governance/jti-store.ts`
- Test: `packages/shared/tests/governance/jti-store.test.ts`

**Step 1: Failing test**
```ts
import { InMemoryJtiStore } from "../../src/index.js";
it("consumes a jti once", async () => {
  const s = new InMemoryJtiStore();
  expect(await s.consumeOnce("j1", 1000)).toBe("fresh");
  expect(await s.consumeOnce("j1", 1000)).toBe("replayed");
});
it("expires after ttl", async () => {
  const now = { t: 0 };
  const s = new InMemoryJtiStore(() => now.t);
  await s.consumeOnce("j1", 100);
  now.t = 101;
  expect(await s.consumeOnce("j1", 100)).toBe("fresh"); // expired entry reclaimed
});
```

**Step 2: Run-fail. Step 3: Implement** interface `JtiStore { consumeOnce(jti, ttlMs): Promise<"fresh"|"replayed"> }` + `InMemoryJtiStore` (Map of jti→expiry, injectable clock for tests, lazy sweep on access).

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): JtiStore interface + InMemoryJtiStore"
```

---

### Task 11: `FirestoreJtiStore` + store selector

**Files:**
- Modify: `packages/shared/src/governance/jti-store.ts`
- Test: `packages/shared/tests/governance/jti-store.test.ts` (extend, with a fake Firestore)

**Step 1: Failing test** — `FirestoreJtiStore` with a fake client: atomic create-if-absent returns `"fresh"` first, `"replayed"` on duplicate; `selectJtiStore({ mode, env })` returns Firestore when `GOVERNANCE_JTI_STORE=firestore`, else in-memory; **emits a warning when `mode==="enforce"` and store is in-memory** (assert via injected logger spy).

**Step 2: Run-fail. Step 3: Implement** `FirestoreJtiStore`.
- **Dependency strategy: dynamic optional peer dep — do NOT add `@google-cloud/firestore` to `packages/shared/package.json` or the lockfile.** Mirror the existing `report-spill.ts` / `InteractionLogger` GCS pattern exactly:
  ```ts
  // Dynamic import so `@google-cloud/firestore` stays an optional peer dep —
  // self-hosted / in-memory deployments never load the SDK. Same pattern as
  // report-spill.ts (@google-cloud/storage).
  const moduleName = "@google-cloud/firestore";
  const { Firestore } = (await import(moduleName)) as { Firestore: new () => unknown };
  ```
  Inject the Firestore client (or a factory) into the constructor so tests pass a fake and the real SDK is only imported by `selectJtiStore` in hosted mode.
- Atomic consume-once via `collection.doc(jti).create({ expiresAt })` — `create()` rejects with `ALREADY_EXISTS` on a duplicate doc → map to `"replayed"`; success → `"fresh"`. TTL via the `expiresAt` field + a Firestore TTL policy (provisioned in Terraform — see Risks §4; the policy is what reclaims storage, not the store).
- `selectJtiStore({ mode, env, logger })` factory + enforce-in-memory warning.

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): FirestoreJtiStore + store selector with enforce/in-memory warning"
```

---

### Task 12: `verifyDecisionToken` (the core)

**Files:**
- Create: `packages/shared/src/governance/decision-token.ts`
- Test: `packages/shared/tests/governance/decision-token.test.ts`

**Step 1: Failing test (the full matrix)** — build a helper that mints HS256 tokens with `jose.SignJWT`. Assert verdict `reasonCode` for each:
- valid (all required claims present) → `OK`
- missing token → `MISSING_TOKEN`
- not three dot-separated segments / undecodable header → `MALFORMED_TOKEN`
- `alg: "none"` / RS256 → `UNSUPPORTED_ALG`
- wrong secret → `INVALID_SIGNATURE`
- accepted under previous secret (no `kid`, fallback) → `OK`
- **`kid` selection**: `kid: "current"` signed with current secret → `OK`; `kid: "previous"` signed with previous secret → `OK`; unknown `kid` → `INVALID_SIGNATURE` (no secret to try); `kid: "current"` but signed with previous secret → `INVALID_SIGNATURE` (kid pins the secret, no fallback when kid is present)
- **a signed token MISSING any required claim** (`jti`, `exp`, `iat`, `sub`, `contractId`, `definitionHash`, `actionHash`) → `MISSING_CLAIM` (one assertion per claim; a token missing `jti`/`exp` must NEVER reach `OK` or call `consumeOnce`)
- malformed claim type (e.g. `exp` non-numeric, `jti` non-string/empty) → `MALFORMED_TOKEN`
- expired (`exp` in past) → `EXPIRED`
- `iss`/`aud` wrong → `WRONG_ISSUER`/`WRONG_AUDIENCE`
- contractId mismatch → `CONTRACT_MISMATCH`
- definitionHash mismatch → `DEFINITION_HASH_MISMATCH`
- actionHash mismatch → `ACTION_HASH_MISMATCH`
- duplicate jti → `REPLAYED_JTI`
- reordered args → same actionHash → `OK`
- **jti NOT consumed when ANY prior check fails** (inject a jti store spy; assert `consumeOnce` not called on missing-claim / expired / any-mismatch). Specifically assert a token missing `jti` returns `MISSING_CLAIM` and never calls `consumeOnce`.

> `jose.jwtVerify` validates signature, `exp`, and (when options passed) `iss`/`aud`/required-claims, but does NOT know about `contractId`/`definitionHash`/`actionHash`. Do explicit presence+type checks for ALL required claims before binding checks, and before jti consume.

**Step 2: Run-fail. Step 3: Implement**
```ts
export interface VerifyOpts {
  token: string | undefined;
  // Keyed by kid; "current"/"previous" are the conventional ids. When the token
  // header carries a kid, ONLY that secret is tried (no fallback). When it has no
  // kid, try current then previous.
  secrets: { current: string; previous?: string };
  expected: { contractId: string; definitionHash: string; actionHash: string };
  jtiStore: JtiStore;
  jtiTtlMs: number;
  clockToleranceSec?: number;
  now?: () => number;
}
export interface DecisionTokenVerdict {
  ok: boolean;
  // OK | MISSING_TOKEN | MALFORMED_TOKEN | UNSUPPORTED_ALG | INVALID_SIGNATURE
  // | MISSING_CLAIM | EXPIRED | WRONG_ISSUER | WRONG_AUDIENCE | CONTRACT_MISMATCH
  // | DEFINITION_HASH_MISMATCH | ACTION_HASH_MISMATCH | REPLAYED_JTI
  reasonCode: string;
  detail?: string;              // e.g. which claim was missing ("jti") — safe to log
  claims?: { sub?: string; contractId?: string; jti?: string; approvalId?: string };
}

// Required claims that must be present AND well-typed before any binding check.
const REQUIRED_CLAIMS = ["jti", "exp", "iat", "sub", "contractId", "definitionHash", "actionHash"] as const;

export async function verifyDecisionToken(opts: VerifyOpts): Promise<DecisionTokenVerdict> { /* order below */ }
```

Verification order (each returns immediately on failure; **`consumeOnce` is reached only after EVERYTHING else passes**):
1. No token → `MISSING_TOKEN`.
2. `jose.decodeProtectedHeader` fails / not 3 segments → `MALFORMED_TOKEN`. Header `alg !== "HS256"` → `UNSUPPORTED_ALG`.
3. Select candidate secret(s) from the header `kid`: if `kid` present, use only `secrets[kid]` (unknown kid → no candidate → `INVALID_SIGNATURE`); if absent, try `current` then `previous`. Run `jose.jwtVerify(token, secret, { algorithms: ["HS256"] })` over candidates; all fail → `INVALID_SIGNATURE`. (jose validates `exp` here; if it throws specifically for expiry, map to `EXPIRED` — but also re-check `exp` explicitly in step 5 for the missing-`exp` case, since a token with no `exp` would pass jose's expiry check.)
4. **Required-claim presence + type**: for each of `REQUIRED_CLAIMS`, if absent → `MISSING_CLAIM` (`detail` = claim name); if present but wrong type (`exp`/`iat` non-finite-number, `jti`/`sub`/`contractId`/`definitionHash`/`actionHash` non-empty-string) → `MALFORMED_TOKEN`.
5. `exp` past (with `clockToleranceSec`) → `EXPIRED`.
6. `iss !== "cesteral-intelligence"` → `WRONG_ISSUER`; `aud !== "mcp-open-advertising"` → `WRONG_AUDIENCE`.
7. `contractId` ≠ expected → `CONTRACT_MISMATCH`.
8. `definitionHash` ≠ expected → `DEFINITION_HASH_MISMATCH`.
9. `actionHash` ≠ expected → `ACTION_HASH_MISMATCH`.
10. `jtiStore.consumeOnce(jti, jtiTtlMs)` === `"replayed"` → `REPLAYED_JTI`; else `OK`.

- A signed token missing `jti` or `exp` therefore returns `MISSING_CLAIM` at step 4 and **never reaches step 10**.
- Never throw for verdicts — return them (caller decides warn/enforce).

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): verifyDecisionToken (HS256, claim binding, jti consume-last)"
```

---

### Task 13: Audit logging + metric

**Files:**
- Create: `packages/shared/src/governance/audit.ts`
- Modify: metrics module (`packages/shared/src/utils/metrics.ts` — follow existing `recordToolExecution` pattern)
- Test: `packages/shared/tests/governance/audit.test.ts`

**Step 1: Failing test** — `logDecisionTokenVerdict(logger, { verdict, mode, contractId, toolName, claims })` emits a structured record with `component: "governance-audit"`, fields `sub`, `contractId`, `toolName`, `jti`, `status`, `reasonCode`, `detail`, `mode`, and **never includes the raw token/secret** (assert serialized log has no `token` field; pass a fake verdict with a `MISSING_CLAIM`/`detail: "jti"` and assert `detail` is logged). `recordDecisionTokenVerification(reasonCode, mode)` increments a counter (spy the OTEL meter like `metrics.test.ts` does).

**Step 2–5:** implement, run-pass, commit.
```bash
git commit -am "feat(shared): decision-token audit logging + verification metric"
```

---

### Task 14: Wire verification into `tool-handler-factory`

**Files:**
- Modify: `packages/shared/src/utils/tool-handler-factory.ts` (handler body, after authz block ~L457-507, before `tool.logic` ~L544; carry `rawArgs` = the original `args` before `inputSchema.parse`)
- Test: `packages/shared/tests/utils/tool-handler-factory.test.ts` (extend) + reuse `tool-handler-factory-authz.test.ts` patterns

**Step 1: Failing test** — register a fake `entity` write tool; via the handler:
- mode `off` → handler runs regardless of token (no verification).
- mode `warn`, bad token → handler still runs, audit logged.
- mode `enforce`, missing/invalid token → handler throws `McpError(Unauthorized)`, `tool.logic` NOT invoked.
- mode `enforce`, valid token → runs once; replay → rejected.
- **authz denial happens before jti consume** (unauthorized advertiser + valid token → jti store `consumeOnce` not called).

**Step 2: Run-fail. Step 3: Implement** in the handler, gated to `tool.annotations?.cesteral?.kind === "write"`:
```ts
const cesteral = tool.annotations?.cesteral as CesteralWriteToolAnnotations | undefined;
if (cesteral?.kind === "write") {
  const mode = resolveTokenMode({ contractId: cesteral.contractId, env: process.env });
  if (mode !== "off") {
    const definitionHash = computeDefinitionHash(toHashable(tool)); // build from name/desc/schemas/annotations
    const executable = canonicalizeExecutableArgs({ rawArgs: args, exclude: cesteral.executableArgsExclude });
    const verdict = await verifyDecisionToken({
      token: getRequestContext()?.decisionToken,
      secrets: { current: process.env.GOVERNANCE_DECISION_TOKEN_SECRET ?? "",
                 previous: process.env.GOVERNANCE_DECISION_TOKEN_SECRET_PREVIOUS },
      expected: { contractId: cesteral.contractId, definitionHash, actionHash: hashActionInput(executable) },
      jtiStore, jtiTtlMs,
    });
    logDecisionTokenVerdict(auditLogger, { verdict, mode, contractId: cesteral.contractId, toolName: tool.name });
    recordDecisionTokenVerification(verdict.reasonCode, mode);
    if (mode === "enforce" && !verdict.ok) {
      throw new McpError(JsonRpcErrorCode.Unauthorized, `Governance: ${verdict.reasonCode}`);
    }
    // expose idempotency key to tool.logic
    sdkContext.idempotencyKey = verdict.claims?.jti ?? hashActionInput(executable);
  }
}
```
- Place this block **after** the advertiser-scope authz return path so unauthorized calls never reach jti consume.
- `jtiStore`/`jtiTtlMs` come from `RegisterToolsOptions` (add them; default `selectJtiStore(...)` + 600_000). Add `idempotencyKey?: string` to `ToolSdkContext`.
- `toHashable(tool)` mirrors the manifest projection (name, description, inputSchema, outputSchema, annotations) — extract a shared helper so factory and `scripts/lib/manifest.mjs` agree. (DRY: consider exporting it from `@cesteral/contract-hash`.)

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(shared): verify decision token in tool-handler-factory (gated to writes, off by default)"
```

---

### Task 15: Header threading + CORS

**Files:**
- Modify: `packages/shared/src/utils/mcp-http-transport-factory.ts` (in the `runWithRequestContext` setup ~L337-340, set `reqCtx.decisionToken = extractHeader(headers, "x-cesteral-decision-token")`)
- Modify: each server's transport `corsAllowHeaders` list (13 files: `packages/*/src/mcp-server/transports/streamable-http-transport.ts`)
- Test: `packages/shared/tests/utils/mcp-transport-helpers.test.ts` or a focused factory test asserting the header lands on the context.

**Step 1: Failing test** — simulate a POST with the header; assert `getRequestContext()?.decisionToken` inside a tool equals the header value. (Reuse existing transport test harness if present; else unit-test the extraction helper.)

**Step 2: Run-fail. Step 3: Implement** the one-line extraction in the factory + add `"x-cesteral-decision-token"` to all 13 `corsAllowHeaders` arrays.

**Step 4: Run-pass. Step 5: Commit**
```bash
git commit -am "feat(transport): thread X-Cesteral-Decision-Token into RequestContext + CORS"
```

---

### Task 16: Public exports

**Files:**
- Modify: `packages/shared/src/index.ts`, `packages/contract-hash/src/index.ts` (already exported in earlier tasks)
- Test: a smoke test importing every new symbol from `@cesteral/shared`.

Export: `verifyDecisionToken`, `DecisionTokenVerdict`, `JtiStore`, `InMemoryJtiStore`, `FirestoreJtiStore`, `selectJtiStore`, `resolveTokenMode`, `logDecisionTokenVerdict`, `recordDecisionTokenVerification`, `assertGovernedEffectDryRun`, `EffectResultSchema`, `EffectResult`, `EffectDryRunResultSchema`, `isEntityWrite`, `isEffectWrite`, and the new annotation/type names.

**Commit:** `git commit -am "feat(shared): export governance decision-token API"`

---

### Task 17: Build, full test, manifest-hash regression

**Steps:**
1. `pnpm run build && pnpm run typecheck` — expect clean across ALL packages (Task 5b is mandatory, so no package is left half-migrated).
2. `pnpm run test` — all green.
3. **Critical regression:** `pnpm run generate:manifests` then `git diff` the `dist/cesteral-manifest.json` files. Adding `writeClass`/`executableArgsExclude` to the 13 `update_entity` annotations **changes their `definitionHash`** (annotations are in the hash projection). This is expected and must be coordinated with governance (the signed manifest + downstream attestation). **Document the hash delta in the PR description** and flag for the governance team — this is the "definitionHash matches connector's current tool definition" claim source. Until governance re-attests, those contracts stay in `warn`/`off`.
4. Commit any regenerated manifests: `git commit -am "chore: regenerate manifests after writeClass migration"`.

**PR 1 done.** Open the PR with: behavior unchanged at default (`off`); hash-delta note; the three open governance items from the design doc §12.

---

## PRs 2–N — Contract expansion (task TEMPLATES)

Each governed write tool follows ONE of two templates. Batch by operation family; one PR per family per ~2-3 servers; **every batch stays warn-only** and carries a downstream-governance checklist.

### Template A — `entity` write (create / delete / bulk_update_status on canonical kinds)

For tool file `packages/<server>/src/mcp-server/tools/definitions/<op>.tool.ts`:
1. **Test first:** add a response-schema test (dry-run → `DryRunResultSchema`; execute → `before?`/`after` `NormalizedEntitySnapshotSchema` + required `dispatchedCapability` with non-null `canonicalEntityKind`).
2. Add `outputSchema` fields: `dryRun?`, `before?`, `after?`, `dispatchedCapability`.
3. Add `cesteral` annotation: `kind:"write"`, `writeClass:"entity"`, slugs, `contractId = <platform>.<op>.v1`, `operation`, `entityKinds`, `entityIdArgs`, `executableArgsExclude:["dry_run"]`, `readPartner`, `supportsDryRun`, `supportsBeforeAfterSnapshot:true`, `requiresValidation:true`, `requiresSimulation:true`.
4. Implement native-first dry-run (or symbolic) + before/after capture (reuse the server's existing `capture*Snapshot` + `snapshotFrom*Entity` helpers).
5. Add `assertGovernedDryRunResult` in the dry-run path.
6. Run package tests; regenerate manifest; commit.
7. Downstream checklist: register any new EntityKind (6 sites per memory `project-governed-write-contract`); add `admit.<platform>-<kind>.test.ts` upstream.

### Template B — `effect` write (uploads / report-schedule CRUD / conversion upload / graphql bulk / adjust-bids w/o snapshot)

1. **Test first:** execute → `structuredContent.effect` validates `EffectResultSchema` + `dispatchedCapability` with `canonicalEntityKind: null`; dry-run (if supported) → `EffectDryRunResultSchema`.
2. Add `outputSchema`: `effect`, optional `dryRun` (effect variant), `dispatchedCapability`.
3. Add `cesteral` annotation: `kind:"write"`, `writeClass:"effect"`, slugs, `contractId`, `operation`, `entityKinds: []`, `entityIdArgs`, `executableArgsExclude`, no `readPartner`, honest `supportsDryRun`/`supportsBeforeAfterSnapshot:false`/`requiresValidation`/`requiresSimulation`.
4. Build `effect.summary` with idempotency/audit identity ONLY; **redact** raw uploaded/conversion payloads via the `http-request-recorder` redaction conventions.
5. If `requiresValidation`/`requiresSimulation`, call `assertGovernedEffectDryRun` in dry-run path.
6. Run tests; regenerate manifest; commit.
7. Downstream checklist: governance must accept `writeClass:"effect"` + nullable `canonicalEntityKind` + new `operation`/`effectKind` enums before admission.

### Fleet-wide coverage test (add in PR 2, maintain every batch)
`packages/shared/tests/` or a root test: load each server's `allTools` (or a generated inventory), assert every tool with `annotations.readOnlyHint === false` (a write) **either** carries a valid `cesteral` write annotation **or** is on an explicit, documented allowlist of not-yet-migrated tools. Snapshot each annotation + `definitionHash`. This test is the coverage ratchet that drives PRs 3–N to completion and prevents new ungoverned writes from sneaking in.

### Enforcement flip (final)
Per-contract, once governance re-attests the new `definitionHash` and coverage for that family is complete: move the `contractId` from `GOVERNANCE_TOKEN_MODE_WARN_CONTRACTS` to `..._ENFORCE_CONTRACTS`. Start with `*_update_entity`.

---

## Risks / open items (track in PR descriptions)
1. **definitionHash delta** from the `writeClass` migration must be re-attested downstream before enforce.
2. **Golden vectors** are connector-generated until governance provides authoritative ones (design §12.1).
3. **Executable-args shape** (wire-minus-exclude) must be confirmed identical on the governance side (design §12.2).
4. **Firestore TTL policy** must be provisioned (Terraform) for `FirestoreJtiStore` in hosted enforce mode.
