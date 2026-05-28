# Amazon DSP v1 Commitments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend `amazon-dsp-mcp` with 7 new tools wrapping the Amazon Ads API v1 DSP endpoints: `list_commitments`, `get_commitments` (batch read), `get_commitment` (singular read — read partner for the governed update), `create_commitment` (ungoverned single write), `update_commitment` (governed single write), `get_campaign_forecast`, `get_commitment_spend`. Plus one small additive change in `@cesteral/shared` covering both the TS union and the Zod enum for `CanonicalEntityKind`.

**Architecture:** New v1 sub-surface alongside the existing `/dsp/*` surface. Shared `AmazonDspHttpClient` and session services; separate `AmazonDspV1Service` (Zod-parses responses internally) and per-endpoint paths contract. Write tools are single-commitment-per-call matching every other package's `update-entity.tool.ts` pattern. `update_commitment` carries the full governed-write contract (conforming to `CesteralWriteToolAnnotations` verbatim); `create_commitment` is ungoverned (matching every existing `create-entity.tool.ts`). Schema generator (parallel to dv360-mcp's pipeline) produces `src/generated/v1/{types,zod}.ts`; output is committed and CI does NOT run the generator.

**Tech Stack:** TypeScript, Zod, Vitest, `openapi-typescript`, `openapi-zod-client`, `tsx`. Design doc: `docs/plans/2026-05-28-amazon-dsp-v1-commitments-design.md`.

---

## Prerequisites

Before starting Phase 1, place the Amazon Ads API v1 OpenAPI spec at:

```
packages/amazon-dsp-mcp/docs/openapi.json
```

The file is gitignored (716 KB, no stable Amazon URL). Without it the generator will fail with an actionable error. Confirm the file exists:

```bash
ls -lh packages/amazon-dsp-mcp/docs/openapi.json
# expected: ~716K openapi.json
```

---

## Phase 0 — Shared package: add `commitment` canonical kind

### Task 1: Add `commitment` to both the TS union and the Zod enum, extend parity test

**Files:**

- Modify: `packages/shared/src/types/normalized-entity-snapshot.ts:53` (the TypeScript `CanonicalEntityKind` union)
- Modify: `packages/shared/src/schemas/dry-run-result.ts:50` (the Zod `CanonicalEntityKindSchema`)
- Modify: `packages/shared/tests/types/governance-contract.test.ts` (existing parity test — locate line ~80 where the union is asserted)

The TS and Zod versions are mirrored and the parity test at `governance-contract.test.ts:80` enforces it via `expectTypeOf` equality. Touching only one will fail typecheck or the test.

**Step 1: Read current state**

```bash
sed -n '48,65p' packages/shared/src/types/normalized-entity-snapshot.ts
sed -n '48,60p' packages/shared/src/schemas/dry-run-result.ts
grep -n "CanonicalEntityKind\|commitment\|entityKind:" packages/shared/tests/types/governance-contract.test.ts
```

**Step 2: Add failing parity-test cases**

In `packages/shared/tests/types/governance-contract.test.ts`, add (placement near the existing kind-related cases — e.g. next to the existing "accepts insertion_order…" test at ~line 86):

```ts
it("accepts commitment so Amazon DSP commitment writes can be annotated and snapshotted", () => {
  // Type-level: a write annotation may declare commitment as a target kind.
  // (The parity test at the top of this file already enforces the union ↔ schema match.)
  const annotation: CesteralWriteToolAnnotations = {
    // ...minimal fields the existing tests use, plus:
    operation: ["update"],
    // entityKinds: ["commitment"],     // only if your annotation tests use entityKinds
  } as never;

  // Runtime: a NormalizedEntitySnapshot with entityKind: "commitment" round-trips.
  const snapshot = {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "c-1",
    displayName: "Q3 Upfront",
    accountId: "profile-1",
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: /* whatever the existing tests use for budget */ null,
    schedule: { startAt: null, endAt: null },
  };
  expect(() => NormalizedEntitySnapshotSchema.parse(snapshot)).not.toThrow();
});
```

Adapt to the exact import / fixture conventions in that test file — open it first and copy the structure of an existing case.

Run:

```bash
cd packages/shared
pnpm vitest run tests/types/governance-contract.test.ts
# expected: this new test FAILS — "commitment" not in either enum
```

**Step 3: Add `"commitment"` to BOTH enums**

In `packages/shared/src/types/normalized-entity-snapshot.ts:53` extend the union (additive only):

```ts
export type CanonicalEntityKind =
  | "campaign"
  | "ad_set"
  | "insertion_order"
  | "line_item"
  | "ad_group"
  | "ad"
  | "campaign_budget"
  | "order"
  | "commitment";
```

In `packages/shared/src/schemas/dry-run-result.ts:50` extend the Zod enum (additive only):

```ts
const CanonicalEntityKindSchema = z.enum([
  "campaign",
  "ad_set",
  "insertion_order",
  "line_item",
  "ad_group",
  "ad",
  "campaign_budget",
  "order",
  "commitment",
]);
```

**Step 4: Tests pass**

```bash
pnpm vitest run
# expected: all shared tests green, including the parity assertion
```

**Step 5: Verify no downstream package breaks**

```bash
cd ../..
pnpm run typecheck
# expected: no errors anywhere
pnpm run test
# expected: all green across every package
```

**Step 6: Commit**

```bash
git add packages/shared/src/types/normalized-entity-snapshot.ts packages/shared/src/schemas/dry-run-result.ts packages/shared/tests/types/governance-contract.test.ts
git commit -m "feat(shared): add commitment canonical entity kind (TS + Zod + parity test)"
```

---

## Phase 1 — Schema generator infrastructure (contributor-only, NOT wired to prebuild)

### Task 2: Add codegen devDependencies

**Files:**

- Modify: `packages/amazon-dsp-mcp/package.json`

**Step 1: Add deps via pnpm**

```bash
cd packages/amazon-dsp-mcp
pnpm add -D openapi-typescript@^7.10.1 openapi-zod-client@^1.18.3 tsx@^4.20.6
```

**Step 2: Verify**

```bash
jq '.devDependencies | keys' package.json
# expected to contain: openapi-typescript, openapi-zod-client, tsx
```

**Step 3: Commit**

```bash
git add package.json ../../pnpm-lock.yaml
git commit -m "chore(amazon-dsp-mcp): add codegen devDependencies for v1 schemas"
```

---

### Task 3: Add v1 schema-extraction config

**Files:**

- Create: `packages/amazon-dsp-mcp/config/v1-schema-extraction.config.ts`

**Step 1: Write the config**

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export interface V1SchemaExtractionConfig {
  inputSpecPath: string;
  apiVersion: string;
  rootOperations: string[];
  output: {
    filteredSpecPath: string;
    typesPath: string;
    zodPath: string;
  };
}

export const V1_SCHEMA_EXTRACTION_CONFIG: V1SchemaExtractionConfig = {
  inputSpecPath: "docs/openapi.json",
  apiVersion: "v1",
  rootOperations: [
    "DSPListCommitment",
    "DSPCreateCommitment",
    "DSPRetrieveCommitment",
    "DSPUpdateCommitment",
    "DSPRetrieveCampaignForecast",
    "DSPRetrieveCommitmentSpend",
  ],
  output: {
    filteredSpecPath: ".tmp-specs/amazon-ads-api-v1.filtered.json",
    typesPath: "src/generated/v1/types.ts",
    zodPath: "src/generated/v1/zod.ts",
  },
};
```

**Step 2: Commit**

```bash
git add packages/amazon-dsp-mcp/config/v1-schema-extraction.config.ts
git commit -m "feat(amazon-dsp-mcp): add v1 schema-extraction config"
```

---

### Task 4: Write the schema generator script

**Files:**

- Create: `packages/amazon-dsp-mcp/scripts/generate-schemas.ts`
- Create: `packages/amazon-dsp-mcp/scripts/lib/filter-spec.ts`

**Step 1: Write the filter helper**

`packages/amazon-dsp-mcp/scripts/lib/filter-spec.ts`:

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Filters an OpenAPI 3.0 spec down to the transitive closure of a root set
 * of operationIds. All paths whose operations are not in the root set are
 * dropped, and components.schemas is reduced to only those reachable via
 * $ref from the kept paths.
 */

interface OpenApiDoc {
  openapi: string;
  info: unknown;
  servers?: unknown;
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const SCHEMA_REF_PREFIX = "#/components/schemas/";
const PARAM_REF_PREFIX = "#/components/parameters/";

function collectRefs(node: unknown, schemaRefs: Set<string>, paramRefs: Set<string>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, schemaRefs, paramRefs);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$ref" && typeof v === "string") {
      if (v.startsWith(SCHEMA_REF_PREFIX)) {
        schemaRefs.add(v.slice(SCHEMA_REF_PREFIX.length));
      } else if (v.startsWith(PARAM_REF_PREFIX)) {
        paramRefs.add(v.slice(PARAM_REF_PREFIX.length));
      }
    } else {
      collectRefs(v, schemaRefs, paramRefs);
    }
  }
}

export function filterSpecByOperationIds(spec: OpenApiDoc, rootOperationIds: string[]): OpenApiDoc {
  const wantedOps = new Set(rootOperationIds);
  const keptPaths: OpenApiDoc["paths"] = {};

  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    const keptOps: Record<string, unknown> = {};
    for (const [method, op] of Object.entries(pathItem)) {
      if (
        op &&
        typeof op === "object" &&
        "operationId" in op &&
        wantedOps.has((op as { operationId: string }).operationId)
      ) {
        keptOps[method] = op;
      }
    }
    if (Object.keys(keptOps).length > 0) {
      keptPaths[pathKey] = keptOps;
    }
  }

  const found = new Set<string>();
  for (const item of Object.values(keptPaths)) {
    for (const op of Object.values(item)) {
      if (op && typeof op === "object" && "operationId" in op) {
        found.add((op as { operationId: string }).operationId);
      }
    }
  }
  const missing = [...wantedOps].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Root operations not found in spec: ${missing.join(", ")}`);
  }

  const schemaRefs = new Set<string>();
  const paramRefs = new Set<string>();
  collectRefs(keptPaths, schemaRefs, paramRefs);

  let added = true;
  while (added) {
    added = false;
    for (const name of [...schemaRefs]) {
      const schema = spec.components.schemas[name];
      if (!schema) continue;
      const before = schemaRefs.size;
      collectRefs(schema, schemaRefs, paramRefs);
      if (schemaRefs.size > before) added = true;
    }
  }

  const keptSchemas: Record<string, unknown> = {};
  for (const name of schemaRefs) {
    if (spec.components.schemas[name]) {
      keptSchemas[name] = spec.components.schemas[name];
    }
  }
  const keptParams: Record<string, unknown> = {};
  if (spec.components.parameters) {
    for (const name of paramRefs) {
      if (spec.components.parameters[name]) {
        keptParams[name] = spec.components.parameters[name];
      }
    }
  }

  return {
    ...spec,
    paths: keptPaths,
    components: {
      ...spec.components,
      schemas: keptSchemas,
      parameters: keptParams,
    },
  };
}
```

**Step 2: Write the generator entry point**

`packages/amazon-dsp-mcp/scripts/generate-schemas.ts`:

```ts
#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { V1_SCHEMA_EXTRACTION_CONFIG } from "../config/v1-schema-extraction.config.js";
import { filterSpecByOperationIds } from "./lib/filter-spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

async function main(): Promise<void> {
  const cfg = V1_SCHEMA_EXTRACTION_CONFIG;
  const specPath = path.resolve(PACKAGE_ROOT, cfg.inputSpecPath);

  let raw: string;
  try {
    raw = await fs.readFile(specPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `OpenAPI spec not found at ${cfg.inputSpecPath}.\n` +
          `This file is gitignored — place a copy of the Amazon Ads API v1 spec there before running this generator.\n` +
          `See docs/plans/2026-05-28-amazon-dsp-v1-commitments-design.md §5.\n` +
          `Note: this generator is contributor-only and is NOT run by CI; CI builds against the committed src/generated/v1/* output.`
      );
    }
    throw e;
  }

  const fullSpec = JSON.parse(raw);
  const filtered = filterSpecByOperationIds(fullSpec, cfg.rootOperations);

  const filteredAbs = path.resolve(PACKAGE_ROOT, cfg.output.filteredSpecPath);
  await fs.mkdir(path.dirname(filteredAbs), { recursive: true });
  await fs.writeFile(filteredAbs, JSON.stringify(filtered, null, 2), "utf-8");

  const schemaCount = Object.keys(filtered.components.schemas).length;
  const pathCount = Object.keys(filtered.paths).length;
  console.log(
    `Filtered spec: ${pathCount} paths, ${schemaCount} schemas (from ${
      Object.keys(fullSpec.components.schemas).length
    })`
  );

  const typesAbs = path.resolve(PACKAGE_ROOT, cfg.output.typesPath);
  const zodAbs = path.resolve(PACKAGE_ROOT, cfg.output.zodPath);
  await fs.mkdir(path.dirname(typesAbs), { recursive: true });
  await fs.mkdir(path.dirname(zodAbs), { recursive: true });

  execSync(`pnpm exec openapi-typescript "${filteredAbs}" -o "${typesAbs}"`, {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });

  execSync(`pnpm exec openapi-zod-client "${filteredAbs}" -o "${zodAbs}" --export-schemas`, {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });

  console.log(`Generated: ${cfg.output.typesPath}, ${cfg.output.zodPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/scripts/
git commit -m "feat(amazon-dsp-mcp): add v1 schema generator script"
```

---

### Task 5: Wire `generate:schemas` into package.json (NOT prebuild)

**Files:**

- Modify: `packages/amazon-dsp-mcp/package.json`

**Step 1: Add the script**

Edit `packages/amazon-dsp-mcp/package.json` and add the `"generate:schemas"` script. **Do not add `prebuild`** — the script is contributor-only because the spec is gitignored. Extend `clean` to include `.tmp-specs`:

```json
"generate:schemas": "tsx scripts/generate-schemas.ts",
"clean": "rm -rf dist *.tsbuildinfo .tmp-specs"
```

**Step 2: Verify there is no `prebuild` entry**

```bash
jq '.scripts | keys' packages/amazon-dsp-mcp/package.json
# expected: prebuild is NOT in the list. generate:schemas IS.
```

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/package.json
git commit -m "chore(amazon-dsp-mcp): add generate:schemas script (contributor-only, not wired to prebuild)"
```

---

### Task 6: Run the generator and commit the output

**Files:**

- Generated: `packages/amazon-dsp-mcp/src/generated/v1/types.ts`
- Generated: `packages/amazon-dsp-mcp/src/generated/v1/zod.ts`

**Step 1: Run the generator**

```bash
cd packages/amazon-dsp-mcp
pnpm run generate:schemas
```

Expected output: `Filtered spec: 6 paths, <100 schemas (from 1101)` then `Generated: src/generated/v1/types.ts, src/generated/v1/zod.ts`.

If you see `OpenAPI spec not found`, satisfy the Prerequisites section at the top of this plan.

**Step 2: Sanity-check the output**

```bash
wc -l src/generated/v1/types.ts src/generated/v1/zod.ts
# expected: both files non-trivial; well under ~200 KB each

grep -c "DSPCommitment\b" src/generated/v1/zod.ts
# expected: > 0
```

**Step 3: Confirm gitignore stance**

`src/generated/v1/` IS tracked (committed for IDE / CI parity, same as dv360 commits `src/generated/schemas/`). `.tmp-specs/` is gitignored at the repo root already.

```bash
git status
# expected: untracked src/generated/v1/types.ts and zod.ts; .tmp-specs/ NOT shown
```

**Step 4: Commit generated output**

```bash
git add packages/amazon-dsp-mcp/src/generated/v1/
git commit -m "feat(amazon-dsp-mcp): generate v1 schemas (commitments, forecasts, spends)"
```

---

## Phase 2 — Paths contract + service

### Task 7: Add v1 paths contract

**Files:**

- Create: `packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-v1-api-contract.ts`

**Step 1: Write the constants module**

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export const AMAZON_DSP_V1_PATHS = {
  listCommitments: "/adsApi/v1/commitments/dsp",
  retrieveCommitments: "/adsApi/v1/retrieve/commitments/dsp",
  createCommitments: "/adsApi/v1/create/commitments/dsp",
  updateCommitments: "/adsApi/v1/update/commitments/dsp",
  retrieveCampaignForecast: "/adsApi/v1/retrieve/campaignForecasts/dsp",
  retrieveCommitmentSpend: "/adsApi/v1/retrieve/commitmentSpends/dsp",
} as const;

export type AmazonDspV1Path = (typeof AMAZON_DSP_V1_PATHS)[keyof typeof AMAZON_DSP_V1_PATHS];
```

**Step 2: Commit**

```bash
git add packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-v1-api-contract.ts
git commit -m "feat(amazon-dsp-mcp): add v1 paths contract"
```

---

### Task 8: Write failing service tests

**Files:**

- Create: `packages/amazon-dsp-mcp/tests/services/amazon-dsp-v1-service.test.ts`

**Step 1: Write the test file**

Cover:

- list/retrieve calls hit the right path with `application/json` (NOT a vendor media type)
- Batch reads (`retrieveCommitments`, `retrieveCampaignForecast`, `retrieveCommitmentSpend`) Zod-parse the multi-status response and return it
- `createCommitment` wraps input into `{ commitments: [input] }` on send AND unwraps `success[0]` from the multi-status on response
- `createCommitment` throws `McpError` when the response has `error[0]` (per-item Amazon error)
- `updateCommitment` does the same wrap/unwrap

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { AmazonDspV1Service } from "../../src/services/amazon-dsp/amazon-dsp-v1-service.js";
import { AMAZON_DSP_V1_PATHS } from "../../src/services/amazon-dsp/amazon-dsp-v1-api-contract.js";

function makeClient(responseBody: unknown) {
  return {
    get: vi.fn().mockResolvedValue(responseBody),
    post: vi.fn().mockResolvedValue(responseBody),
    put: vi.fn(),
  };
}

const logger = pino({ level: "silent" });

describe("AmazonDspV1Service", () => {
  it("listCommitments hits GET /adsApi/v1/commitments/dsp", async () => {
    const client = makeClient({ commitments: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.listCommitments({ maxResults: 25 });
    expect(client.get).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.listCommitments,
      expect.objectContaining({ maxResults: "25" }),
      undefined
    );
  });

  it("getCommitment wraps the id into a 1-element batch and unwraps success[0]", async () => {
    const found = {
      commitmentId: "c1",
      commitmentName: "X",
      committedSpend: 1,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00Z",
      startDateTime: "2026-01-01T00:00:00Z",
      fulfillmentLevel: "STRICT",
      spendCalculationMode: "MEDIA",
    };
    const client = makeClient({ success: [found], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    const result = await svc.getCommitment("c1");
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitments,
      { commitmentIds: ["c1"] },
      undefined
    );
    expect(result).toEqual(found);
  });

  it("getCommitment throws McpError when Amazon returns the id in error[]", async () => {
    const client = makeClient({
      success: [],
      error: [{ commitmentId: "missing", code: "NOT_FOUND", message: "not found" }],
    });
    const svc = new AmazonDspV1Service(client as never, logger);
    await expect(svc.getCommitment("missing")).rejects.toMatchObject({
      message: expect.stringContaining("not found"),
    });
  });

  it("retrieveCommitments posts to /adsApi/v1/retrieve/commitments/dsp and parses multi-status", async () => {
    const body = {
      success: [
        {
          commitmentId: "c1",
          commitmentName: "X",
          committedSpend: 1,
          currencyCode: "USD",
          endDateTime: "2027-01-01T00:00:00Z",
          startDateTime: "2026-01-01T00:00:00Z",
          fulfillmentLevel: "STRICT",
          spendCalculationMode: "MEDIA",
        },
      ],
      error: [],
    };
    const client = makeClient(body);
    const svc = new AmazonDspV1Service(client as never, logger);
    const result = await svc.retrieveCommitments({ commitmentIds: ["c1"] });
    expect(result).toEqual(body);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitments,
      { commitmentIds: ["c1"] },
      undefined
    );
  });

  it("createCommitment wraps input into a 1-element batch and unwraps success[0]", async () => {
    const created = {
      commitmentId: "c-new",
      commitmentName: "X",
      committedSpend: 100,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00Z",
      startDateTime: "2026-01-01T00:00:00Z",
      fulfillmentLevel: "STRICT",
      spendCalculationMode: "MEDIA",
    };
    const client = makeClient({ success: [created], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    const input = {
      commitmentName: "X",
      committedSpend: 100,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00Z",
      startDateTime: "2026-01-01T00:00:00Z",
      fulfillmentLevel: "STRICT",
      spendCalculationMode: "MEDIA",
    } as never;
    const result = await svc.createCommitment(input);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.createCommitments,
      { commitments: [input] },
      undefined
    );
    expect(result).toEqual(created);
  });

  it("createCommitment throws McpError when Amazon returns the item in error[]", async () => {
    const client = makeClient({
      success: [],
      error: [{ commitmentId: null, code: "INVALID", message: "Overlapping dates" }],
    });
    const svc = new AmazonDspV1Service(client as never, logger);
    await expect(svc.createCommitment({} as never)).rejects.toMatchObject({
      message: expect.stringContaining("Overlapping dates"),
    });
  });

  it("updateCommitment wraps + unwraps the same way", async () => {
    const updated = {
      commitmentId: "c1",
      commitmentName: "X",
      committedSpend: 200,
      currencyCode: "USD",
      endDateTime: "2027-01-01T00:00:00Z",
      startDateTime: "2026-01-01T00:00:00Z",
      fulfillmentLevel: "STRICT",
      spendCalculationMode: "MEDIA",
    };
    const client = makeClient({ success: [updated], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    const input = { commitmentId: "c1", committedSpend: 200 } as never;
    const result = await svc.updateCommitment(input);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.updateCommitments,
      { commitments: [input] },
      undefined
    );
    expect(result).toEqual(updated);
  });

  it("retrieveCampaignForecast + retrieveCommitmentSpend hit their respective paths", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.retrieveCampaignForecast({} as never);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCampaignForecast,
      expect.any(Object),
      undefined
    );
    await svc.retrieveCommitmentSpend({} as never);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend,
      expect.any(Object),
      undefined
    );
  });
});
```

**Step 2: Run → FAIL**

```bash
cd packages/amazon-dsp-mcp
pnpm vitest run tests/services/amazon-dsp-v1-service.test.ts
# expected: FAIL (Cannot find module)
```

---

### Task 9: Implement `AmazonDspV1Service`

**Files:**

- Create: `packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-v1-service.ts`

**Step 1: Write the service**

Use the generated Zod schemas (`DSPCommitmentSchema`, `DSPCommitmentMultiStatusResponseSchema`, etc.) from `src/generated/v1/zod.ts`. Exact schema-export names depend on `openapi-zod-client` output — check `src/generated/v1/zod.ts` first.

Skeleton:

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { RequestContext } from "@cesteral/shared";
import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import { AMAZON_DSP_V1_PATHS } from "./amazon-dsp-v1-api-contract.js";
// import { DSPCommitmentMultiStatusResponseSchema, DSPCommitmentSuccessResponseSchema, ... } from "../../generated/v1/zod.js";
// import type { DSPCommitment, DSPCommitmentCreate, DSPCommitmentUpdate, ... } from "../../generated/v1/zod.js";

export interface ListCommitmentsParams {
  nextToken?: string;
  maxResults?: number;
}

export class AmazonDspV1Service {
  constructor(
    private readonly client: AmazonDspHttpClient,
    private readonly logger: Logger
  ) {}

  async listCommitments(params: ListCommitmentsParams, context?: RequestContext) {
    const query: Record<string, string> = {};
    if (params.nextToken !== undefined) query.nextToken = params.nextToken;
    if (params.maxResults !== undefined) query.maxResults = String(params.maxResults);
    const raw = await this.client.get(AMAZON_DSP_V1_PATHS.listCommitments, query, context);
    return DSPCommitmentSuccessResponseSchema.parse(raw);
  }

  async retrieveCommitments(body: { commitmentIds: string[] }, context?: RequestContext) {
    const raw = await this.client.post(AMAZON_DSP_V1_PATHS.retrieveCommitments, body, context);
    return DSPCommitmentMultiStatusResponseSchema.parse(raw);
  }

  // Single-commitment read — used as readPartner for amazon_dsp_update_commitment.
  // Wraps retrieveCommitments with a 1-element array; throws McpError(NotFound) on per-item error.
  async getCommitment(commitmentId: string, context?: RequestContext): Promise<DSPCommitment> {
    const parsed = await this.retrieveCommitments({ commitmentIds: [commitmentId] }, context);
    if (parsed.success?.length === 1 && (!parsed.error || parsed.error.length === 0)) {
      return parsed.success[0];
    }
    if (parsed.error?.length === 1) {
      const err = parsed.error[0];
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `Amazon DSP could not retrieve commitment ${commitmentId}: ${err.message ?? "not found"}`,
        { code: err.code, raw: err }
      );
    }
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Amazon DSP returned unexpected multi-status shape for single getCommitment: success=${parsed.success?.length ?? 0}, error=${parsed.error?.length ?? 0}`,
      { raw: parsed }
    );
  }

  async createCommitment(
    commitment: DSPCommitmentCreate,
    context?: RequestContext
  ): Promise<DSPCommitment> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.createCommitments,
      { commitments: [commitment] },
      context
    );
    return this.unwrapSingleResult(raw, "create");
  }

  async updateCommitment(
    commitment: DSPCommitmentUpdate,
    context?: RequestContext
  ): Promise<DSPCommitment> {
    const raw = await this.client.post(
      AMAZON_DSP_V1_PATHS.updateCommitments,
      { commitments: [commitment] },
      context
    );
    return this.unwrapSingleResult(raw, "update");
  }

  async retrieveCampaignForecast(body: Record<string, unknown>, context?: RequestContext) {
    const raw = await this.client.post(AMAZON_DSP_V1_PATHS.retrieveCampaignForecast, body, context);
    return DSPCampaignForecastMultiStatusResponseSchema.parse(raw);
  }

  async retrieveCommitmentSpend(body: Record<string, unknown>, context?: RequestContext) {
    const raw = await this.client.post(AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend, body, context);
    return DSPCommitmentSpendMultiStatusResponseSchema.parse(raw);
  }

  private unwrapSingleResult(raw: unknown, op: "create" | "update"): DSPCommitment {
    const parsed = DSPCommitmentMultiStatusResponseSchema.parse(raw);
    if (parsed.success?.length === 1 && (!parsed.error || parsed.error.length === 0)) {
      return parsed.success[0];
    }
    if (parsed.error?.length === 1) {
      const err = parsed.error[0];
      throw new McpError(
        JsonRpcErrorCode.InvalidRequest,
        `Amazon DSP rejected the ${op} commitment request: ${err.message ?? "unknown"}`,
        { code: err.code, raw: err }
      );
    }
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Amazon DSP returned unexpected multi-status shape for single-item ${op}: success=${parsed.success?.length ?? 0}, error=${parsed.error?.length ?? 0}`,
      { raw }
    );
  }
}
```

Adjust schema names + type names to match what `src/generated/v1/zod.ts` actually exports.

**Step 2: Run tests pass**

```bash
pnpm vitest run tests/services/amazon-dsp-v1-service.test.ts
# expected: PASS (6 tests)
```

**Step 3: Commit**

```bash
git add src/services/amazon-dsp/amazon-dsp-v1-service.ts tests/services/amazon-dsp-v1-service.test.ts
git commit -m "feat(amazon-dsp-mcp): add AmazonDspV1Service with wrap/unwrap for single-item writes"
```

---

## Phase 3 — Session wiring

### Task 10: Add `amazonDspV1Service` to `SessionServices`

**Files:**

- Modify: `packages/amazon-dsp-mcp/src/services/session-services.ts`

**Step 1: Read current shape**

```bash
sed -n '1,80p' packages/amazon-dsp-mcp/src/services/session-services.ts
# expect: SessionServices currently has amazonDspService + amazonDspReportingService only
```

**Step 2: Add the field**

In the `SessionServices` interface add:

```ts
amazonDspV1Service: AmazonDspV1Service;
```

In `createSessionServices`, construct it using the SAME `httpClient` already built for the other services:

```ts
const amazonDspV1Service = new AmazonDspV1Service(httpClient, logger);
return { amazonDspService, amazonDspReportingService, amazonDspV1Service };
```

Add the import:

```ts
import { AmazonDspV1Service } from "./amazon-dsp/amazon-dsp-v1-service.js";
```

**Step 3: Typecheck + tests**

```bash
cd packages/amazon-dsp-mcp
pnpm run typecheck
pnpm vitest run
# expected: all green
```

**Step 4: Commit**

```bash
git add src/services/session-services.ts
git commit -m "feat(amazon-dsp-mcp): expose AmazonDspV1Service through session services"
```

---

## Phase 4 — Read tools (4 tools)

Each follows: failing test → tool file → register → run tests → commit. None carry the governed-write `cesteral` block; they're either standard reads (`kind: "read"` on `cesteral` for governance discovery) or carry no `cesteral` block at all — match the existing read-tool convention in `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/get-entity.tool.ts:68` for read-side annotation shape.

### Task 11: `amazon_dsp_list_commitments`

**Files:**

- Create: `tests/tools/amazon-dsp-list-commitments.test.ts`
- Create: `src/mcp-server/tools/definitions/list-commitments.tool.ts`
- Modify: `src/mcp-server/tools/definitions/index.ts` (register tool)

**Step 1: Failing test**

Assert tool name, input accepts `profileId`+`nextToken?`+`maxResults?`(11–50), logic calls `amazonDspV1Service.listCommitments`, output has `{ commitments, nextToken? }`. Mock `resolveSessionServices` to return a stub.

**Step 2: Tool file**

Mirror `get-entity.tool.ts`. `cesteral.kind: "read"` (no `entityKinds`, no `entityIdArgs` since this is a list endpoint, not a read partner). `contractToolSlug: "list_commitments"`, `contractId: "amazon_dsp.list_commitments.v1"`.

**Step 3: Register in `tools/definitions/index.ts`**

**Step 4: Tests pass**

**Step 5: Commit** — `feat(amazon-dsp-mcp): add amazon_dsp_list_commitments tool`

---

### Task 12: `amazon_dsp_get_commitments` (batch read)

Same shape. Input: `{ profileId, commitmentIds: z.array(z.string().min(1)).min(1).max(1000) }`. Output: verbatim `DSPCommitmentMultiStatusResponseSchema`. `responseFormatter` prepends `"<S> succeeded, <E> failed"`. `contractToolSlug: "get_commitments"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_get_commitments tool`

---

### Task 13: `amazon_dsp_get_campaign_forecast`

Same shape. Input: thin wrapper around `DSPRetrieveCampaignForecastRequest` + `profileId`. Output: `DSPCampaignForecastMultiStatusResponseSchema`. Formatter includes warning count: `"<S> succeeded (<W> with warnings), <E> failed"`. `contractToolSlug: "get_campaign_forecast"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_get_campaign_forecast tool`

---

### Task 14: `amazon_dsp_get_commitment_spend`

Same shape. Input: `DSPRetrieveCommitmentSpendRequest` wrapper + `profileId`. Output: `DSPCommitmentSpendMultiStatusResponseSchema`. Formatter includes warning count. `contractToolSlug: "get_commitment_spend"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_get_commitment_spend tool`

---

### Task 15: `amazon_dsp_get_commitment` (single read — read partner for governed update)

**Files:**

- Create: `tests/tools/amazon-dsp-get-commitment.test.ts`
- Create: `src/mcp-server/tools/definitions/get-commitment.tool.ts`
- Modify: `src/mcp-server/tools/definitions/index.ts`

**Why this tool exists.** The governance contract's `readPartner.argMap` maps top-level argument names 1:1 — it cannot reference `commitmentIds[0]` or transform a scalar into an array. The governed `update_commitment` tool takes `commitmentId: string` at the top level, so its read partner must accept the same scalar. This tool wraps the batch endpoint with a 1-element array internally and unwraps the multi-status response — identical to the singular pattern on the service layer.

**Step 1: Failing test**

Mock `amazonDspV1Service.getCommitment` to return a `DSPCommitment`. Assert:

- Tool name `amazon_dsp_get_commitment`
- Input shape `{ profileId, commitmentId: string }`
- Output `{ commitment: DSPCommitment, timestamp }`
- `cesteral.kind === "read"`, `contractToolSlug: "get_commitment"`, `contractId: "amazon_dsp.get_commitment.v1"`
- Second test: service throwing `McpError(NotFound)` propagates as a tool failure

**Step 2: Tool file**

Mirror `get-entity.tool.ts`. Read-side `cesteral` block (no `readPartner`, no `entityKinds`):

```ts
cesteral: {
  kind: "read",
  contractPlatformSlug: "amazon_dsp",
  contractToolSlug: "get_commitment",
  contractId: "amazon_dsp.get_commitment.v1",
  schemaVersion: 1,
} satisfies CesteralReadToolAnnotations,
```

Logic: `await amazonDspV1Service.getCommitment(input.commitmentId, context)`.

**Step 3: Register in `index.ts`**

**Step 4: Tests pass**

**Step 5: Commit** — `feat(amazon-dsp-mcp): add amazon_dsp_get_commitment tool (singular read partner)`

---

## Phase 5 — Write tools

### Task 16: `amazon_dsp_create_commitment` (ungoverned, single)

**Files:**

- Create: `tests/tools/amazon-dsp-create-commitment.test.ts`
- Create: `src/mcp-server/tools/definitions/create-commitment.tool.ts`
- Modify: `src/mcp-server/tools/definitions/index.ts`

**Step 1: Failing test**

Mock `amazonDspV1Service.createCommitment` to return a created `DSPCommitment`. Assert:

- Tool name `amazon_dsp_create_commitment`
- Input shape `{ profileId, data: <DSPCommitmentCreate fields> }`
- Output includes the unwrapped `commitment` and a `timestamp`
- **No** `cesteral` block in annotations (matches `create-entity.tool.ts`)
- `destructiveHint: true`, `openWorldHint: false`
- A second test: service throwing `McpError` (per-item Amazon rejection) propagates as a tool failure with the error code preserved

**Step 2: Tool file**

Match `create-entity.tool.ts:76-119` shape. Input schema:

```ts
export const CreateCommitmentInputSchema = z.object({
  profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
  data: /* generated DSPCommitmentCreateSchema */.describe("Commitment definition"),
});
```

Output:

```ts
export const CreateCommitmentOutputSchema = z.object({
  commitment: /* generated DSPCommitmentSchema */,
  timestamp: z.string().datetime(),
});
```

Logic:

```ts
const { amazonDspV1Service } = resolveSessionServices(sdkContext);
const commitment = await amazonDspV1Service.createCommitment(input.data, context);
return { commitment, timestamp: new Date().toISOString() };
```

Annotations:

```ts
annotations: {
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: false,
  readOnlyHint: false,
  // No `cesteral` block — matches existing create-entity.tool.ts:82
},
```

**Step 3: Register in `index.ts`**

**Step 4: Tests pass**

**Step 5: Commit** — `feat(amazon-dsp-mcp): add amazon_dsp_create_commitment (ungoverned)`

---

### Task 17: `amazon_dsp_update_commitment` (governed, single)

**Files:**

- Create: `tests/tools/amazon-dsp-update-commitment.test.ts`
- Create: `tests/tools/amazon-dsp-update-commitment-dry-run.test.ts`
- Create: `src/mcp-server/tools/definitions/update-commitment.tool.ts`
- Possibly modify: `src/mcp-server/tools/utils/dry-run.ts` (add a helper) — OR inline the logic in the tool file
- Modify: `src/mcp-server/tools/definitions/index.ts`

**Step 1: Failing tests**

Wet-run test asserts:

- Tool name `amazon_dsp_update_commitment`
- Input shape `{ profileId, commitmentId, data: <DSPCommitmentUpdate fields>, dry_run? }`
- Output includes `commitment`, `before`, `after`, `dispatchedCapability: { operation: "update", canonicalEntityKind: "commitment" }`, `timestamp`
- Annotation: `cesteral.kind === "write"`, `operation: ["update"]`, `readPartner.toolName === "amazon_dsp_get_commitment"` (singular), `readPartner.argMap.commitmentId === "commitmentId"`, `requiresValidation: true`, `requiresSimulation: true`, `supportsDryRun: true`, `contractId === "amazon_dsp.update_commitment.v1"`
- Service throw (per-item Amazon error) propagates

Dry-run test asserts:

- `dry_run: true` → no write HTTP call to `updateCommitment`
- Service `getCommitment` IS called for current state (mock to return a `DSPCommitment` with the matching id)
- Output `dryRun: { wouldSucceed, validationErrors, validationSource: "symbolic", expectedStateSource: "server_symbolic_apply", expectedPostState }`
- `expectedPostState.entityKind === "commitment"`, `entityKind` parses through shared `CanonicalEntityKindSchema` (Phase 0 prerequisite)
- Symbolic validation catches an invalid patch (e.g. negative `committedSpend`)

**Step 2: Tool file**

Modeled on `update-entity.tool.ts:75-143` verbatim — same `dispatchedCapability` + `before`/`after` snapshot capture pattern. Differences: no `entityType` arg (only commitments here), service method is `updateCommitment` (single-item).

Sketch:

```ts
export async function updateCommitmentLogic(input, context, sdkContext) {
  const { amazonDspV1Service } = resolveSessionServices(sdkContext);

  const dispatchedCapability = { operation: "update", canonicalEntityKind: "commitment" };

  if (input.dry_run === true) {
    const dryRun = await runCommitmentUpdateDryRun(input, amazonDspV1Service, context);
    return {
      commitmentId: input.commitmentId,
      updated: false,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  // Capture pre-state via the singular read partner (best-effort, per existing update-entity pattern).
  const before = await captureCommitmentSnapshot(amazonDspV1Service, input.commitmentId, context);
  // captureCommitmentSnapshot internally calls amazonDspV1Service.getCommitment(commitmentId).

  const updated = await amazonDspV1Service.updateCommitment(
    { commitmentId: input.commitmentId, ...input.data },
    context
  );

  const after = snapshotFromCommitment(updated);

  return {
    commitmentId: input.commitmentId,
    updated: true,
    commitment: updated,
    timestamp: new Date().toISOString(),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    dispatchedCapability,
  };
}
```

`runCommitmentUpdateDryRun`, `captureCommitmentSnapshot`, `snapshotFromCommitment`: define them in a sibling file `src/mcp-server/tools/utils/commitment-dry-run.ts` (parallel to existing `dry-run.ts`). Use `assertGovernedDryRunResult` from `@cesteral/shared`. `expectedPostState.entityKind` is the literal string `"commitment"` (now valid per Phase 0 Task 1).

Annotations (CRITICAL — conform to `CesteralWriteToolAnnotations` verbatim):

```ts
annotations: {
  destructiveHint: false,
  idempotentHint: true,
  readOnlyHint: false,
  openWorldHint: false,
  cesteral: {
    kind: "write",
    operation: ["update"],
    contractPlatformSlug: "amazon_dsp",
    contractToolSlug: "update_commitment",
    contractId: "amazon_dsp.update_commitment.v1",
    schemaVersion: 1,
    readPartner: {
      toolName: "amazon_dsp_get_commitment",
      argMap: { commitmentId: "commitmentId" },
    },
    requiresValidation: true,
    requiresSimulation: true,
    supportsDryRun: true,
    supportsBeforeAfterSnapshot: true,
  } satisfies CesteralWriteToolAnnotations,
},
```

OutputSchema includes `dispatchedCapability: DispatchedCapabilitySchema` (imported from `@cesteral/shared`) — NOT a custom shape.

**Step 3: Register in `index.ts`**

**Step 4: Tests pass**

```bash
pnpm vitest run tests/tools/amazon-dsp-update-commitment.test.ts tests/tools/amazon-dsp-update-commitment-dry-run.test.ts
# expected: PASS
```

**Step 5: Commit** — `feat(amazon-dsp-mcp): add amazon_dsp_update_commitment (governed write, single-entity)`

---

## Phase 6 — Annotation + coverage tests

### Task 18: Extend `cesteral-annotations.test.ts`

**Files:**

- Modify: `packages/amazon-dsp-mcp/tests/cesteral-annotations.test.ts`

Add assertions:

- 5 read tools (`list_commitments`, `get_commitments`, `get_commitment`, `get_campaign_forecast`, `get_commitment_spend`) have `cesteral.kind === "read"` (or no `cesteral` block — match what was actually written for each).
- `amazon_dsp_create_commitment` has **no** `cesteral` block (matches `create-entity.tool.ts`).
- `amazon_dsp_update_commitment` has the full governed-write block; specifically `readPartner.toolName === "amazon_dsp_get_commitment"` (singular) and `readPartner.argMap.commitmentId === "commitmentId"`. Annotation parses cleanly through `CesteralWriteToolAnnotationsSchema` / `DispatchedCapabilitySchema` from `@cesteral/shared`.

Run + commit: `test(amazon-dsp-mcp): assert v1 commitment-tool annotations`

---

### Task 19: Extend definitions-coverage test

**Files:**

- Modify: `packages/amazon-dsp-mcp/tests/mcp-server/amazon-dsp-definitions-coverage.test.ts`

Add assertion that the 7 new tool slugs are present and `update_commitment` carries `contractId: "amazon_dsp.update_commitment.v1"`. Bump any expected-count constant by 7.

Run + commit: `test(amazon-dsp-mcp): cover v1 commitment tools in definitions coverage`

---

### Task 20: Extend `schema-size.test.ts`

**Files:**

- Modify: `packages/amazon-dsp-mcp/tests/schema-size.test.ts`

Add assertions: `src/generated/v1/types.ts` < 200 KB, `src/generated/v1/zod.ts` < 200 KB. Trip = signal that root-set filter widened.

Run + commit: `test(amazon-dsp-mcp): assert v1 generated schema size budget`

---

## Phase 7 — Full validation

### Task 21: Full build + test cycle

**Step 1: Clean + rebuild from scratch**

```bash
cd packages/amazon-dsp-mcp
pnpm run clean
pnpm run build
# expected: tsc succeeds. NOTE: prebuild is NOT wired, so the spec is not required for this step.
```

**Step 2: Typecheck the whole repo**

```bash
cd ../..
pnpm run typecheck
# expected: no errors anywhere (including shared package consumers of CanonicalEntityKindSchema)
```

**Step 3: Run full test suite**

```bash
pnpm run test
# expected: all green across shared + every package
```

**Step 4: Spot-check the resulting tool list**

```bash
cd packages/amazon-dsp-mcp
pnpm run dev:http &
sleep 3
curl -s -X POST http://localhost:3012/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools[] | select(.name | startswith("amazon_dsp_") and (contains("commitment") or contains("forecast") or contains("spend"))) | .name'
# expected output (any order):
#   "amazon_dsp_list_commitments"
#   "amazon_dsp_get_commitments"
#   "amazon_dsp_get_commitment"
#   "amazon_dsp_create_commitment"
#   "amazon_dsp_update_commitment"
#   "amazon_dsp_get_campaign_forecast"
#   "amazon_dsp_get_commitment_spend"
kill %1
```

**Step 5: Verify the governance contract one more time**

```bash
curl -s -X POST http://localhost:3012/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools[] | select(.name == "amazon_dsp_update_commitment") | .annotations.cesteral'
# expected: object with kind:"write", operation:["update"], contractId:"amazon_dsp.update_commitment.v1",
# readPartner:{ toolName:"amazon_dsp_get_commitment", argMap:{ commitmentId:"commitmentId" } },
# requiresValidation:true, requiresSimulation:true, supportsDryRun:true
```

If everything is already committed, no final commit needed.

---

## Out of scope (deferred follow-ups)

- Live test harness for commitments (`tests/live/`) — needs a DSP account with committed inventory.
- `cesteral-intelligence` upstream addition of `commitment` to its slug schema (additive, non-blocking).
- CI fetch path for the gitignored `openapi.json` (currently contributor-local).
- Sponsored Ads (`/sb`, non-`/dsp` cross-product) coverage — belongs in a separate `amazon-ads-mcp` package, not here.
- Governed creates as a fleet-wide pattern (no precedent in repo today; out of scope for commitments).
- Bulk `amazon_dsp_bulk_update_commitments` tool — only if perf becomes a real need.
