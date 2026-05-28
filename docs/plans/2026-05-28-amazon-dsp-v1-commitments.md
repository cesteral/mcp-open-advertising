# Amazon DSP v1 Commitments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend `amazon-dsp-mcp` with 6 new tools wrapping the Amazon Ads API v1 DSP endpoints: commitments CRUD, campaign forecasts, commitment spends.

**Architecture:** New v1 sub-surface alongside the existing `/dsp/*` surface. Shared `AmazonDspHttpClient` and session services; separate `AmazonDspV1Service` and per-endpoint paths contract. Tools follow the existing `*.tool.ts` shape. Schema generator (parallel to dv360-mcp's pipeline) produces `src/generated/v1/{types,zod}.ts` filtered to the 6 endpoints' transitive closure. Two write tools are governed with per-item symbolic dry-run (no native dry-run on Amazon's side).

**Tech Stack:** TypeScript, Zod, Vitest, `openapi-typescript`, `openapi-zod-client`, `tsx`. Design doc: `docs/plans/2026-05-28-amazon-dsp-v1-commitments-design.md`.

---

## Prerequisites

Before starting Task 1, place the Amazon Ads API v1 OpenAPI spec at:

```
packages/amazon-dsp-mcp/docs/openapi.json
```

The file is gitignored (716 KB, no stable Amazon URL). Without it the generator will fail with an actionable error in Task 5. Confirm the file exists:

```bash
ls -lh packages/amazon-dsp-mcp/docs/openapi.json
# expected: ~716K openapi.json
```

---

## Phase 1 — Schema generator infrastructure

### Task 1: Add codegen devDependencies

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

### Task 2: Add v1 schema-extraction config

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

### Task 3: Write the schema generator script

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

export function filterSpecByOperationIds(
  spec: OpenApiDoc,
  rootOperationIds: string[]
): OpenApiDoc {
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

  const missing = [...wantedOps].filter((id) => {
    return !Object.values(keptPaths).some((item) =>
      Object.values(item).some(
        (op) =>
          op !== null &&
          typeof op === "object" &&
          "operationId" in op &&
          (op as { operationId: string }).operationId === id
      )
    );
  });
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
          `This file is gitignored — place a copy of the Amazon Ads API v1 spec there before building.\n` +
          `See docs/plans/2026-05-28-amazon-dsp-v1-commitments-design.md §5.`
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

  execSync(
    `pnpm exec openapi-zod-client "${filteredAbs}" -o "${zodAbs}" --export-schemas`,
    { cwd: PACKAGE_ROOT, stdio: "inherit" }
  );

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

### Task 4: Wire generator into package.json

**Files:**
- Modify: `packages/amazon-dsp-mcp/package.json`

**Step 1: Add the scripts**

Edit `packages/amazon-dsp-mcp/package.json` and add to the `"scripts"` block:

```json
"prebuild": "pnpm run generate:schemas",
"generate:schemas": "tsx scripts/generate-schemas.ts",
"clean": "rm -rf dist *.tsbuildinfo .tmp-specs"
```

If `clean` already exists, only extend it to include `.tmp-specs`.

**Step 2: Verify**

```bash
jq '.scripts' packages/amazon-dsp-mcp/package.json
# expected to show prebuild, generate:schemas, clean (with .tmp-specs)
```

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/package.json
git commit -m "chore(amazon-dsp-mcp): wire generate:schemas into prebuild"
```

---

### Task 5: Run the generator and verify output

**Files:**
- Generated: `packages/amazon-dsp-mcp/src/generated/v1/types.ts`
- Generated: `packages/amazon-dsp-mcp/src/generated/v1/zod.ts`

**Step 1: Run the generator**

```bash
cd packages/amazon-dsp-mcp
pnpm run generate:schemas
```

Expected output: `Filtered spec: 6 paths, <100 schemas (from 1101)` then `Generated: src/generated/v1/types.ts, src/generated/v1/zod.ts`.

If you see `OpenAPI spec not found`, satisfy the Prerequisites step at the top of this plan.

**Step 2: Sanity-check the output**

```bash
wc -l src/generated/v1/types.ts src/generated/v1/zod.ts
# expected: both files non-trivial (hundreds to low thousands of lines), under ~200KB each

grep -c "DSPCommitment\b" src/generated/v1/zod.ts
# expected: > 0
```

**Step 3: Confirm gitignore stance**

`src/generated/v1/` IS tracked (committed for IDE / CI parity, same as dv360). `.tmp-specs/` is gitignored at the repo root already.

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

### Task 6: Add v1 paths contract

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

### Task 7: Write failing service tests

**Files:**
- Create: `packages/amazon-dsp-mcp/tests/services/amazon-dsp-v1-service.test.ts`

**Step 1: Write the test file**

Cover one happy-path call per endpoint, asserting:
- HTTP path matches `AMAZON_DSP_V1_PATHS.<name>`
- HTTP method matches the spec (GET for list, POST for the rest)
- Request body for POSTs is forwarded verbatim
- Response Zod-parses without throwing
- Content-Type is `application/json` (NOT a vendor media type)

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

  it("retrieveCommitments posts to /adsApi/v1/retrieve/commitments/dsp", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.retrieveCommitments({ commitmentIds: ["c1"] });
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitments,
      { commitmentIds: ["c1"] },
      undefined
    );
  });

  it("createCommitments posts with plain application/json (no vendor media type)", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.createCommitments({ commitments: [] });
    const call = client.post.mock.calls[0];
    expect(call[0]).toBe(AMAZON_DSP_V1_PATHS.createCommitments);
    // 4th + 5th positional args (accept, contentType) must be undefined
    expect(call[3]).toBeUndefined();
    expect(call[4]).toBeUndefined();
  });

  it("updateCommitments hits the update path", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.updateCommitments({ commitments: [{ commitmentId: "c1" }] });
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.updateCommitments,
      expect.objectContaining({ commitments: expect.any(Array) }),
      undefined
    );
  });

  it("retrieveCampaignForecast hits the forecast path", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.retrieveCampaignForecast({} as never);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCampaignForecast,
      expect.any(Object),
      undefined
    );
  });

  it("retrieveCommitmentSpend hits the spend path", async () => {
    const client = makeClient({ success: [], error: [] });
    const svc = new AmazonDspV1Service(client as never, logger);
    await svc.retrieveCommitmentSpend({} as never);
    expect(client.post).toHaveBeenCalledWith(
      AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend,
      expect.any(Object),
      undefined
    );
  });
});
```

**Step 2: Run to confirm failure**

```bash
cd packages/amazon-dsp-mcp
pnpm vitest run tests/services/amazon-dsp-v1-service.test.ts
# expected: FAIL (Cannot find module 'amazon-dsp-v1-service.js')
```

---

### Task 8: Implement AmazonDspV1Service

**Files:**
- Create: `packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-v1-service.ts`

**Step 1: Write the service**

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RequestContext } from "@cesteral/shared";
import type { AmazonDspHttpClient } from "./amazon-dsp-http-client.js";
import { AMAZON_DSP_V1_PATHS } from "./amazon-dsp-v1-api-contract.js";

// NOTE: request/response types are imported from the generated zod module
// once the impl needs strict shapes. The service signatures here are
// intentionally permissive (Record<string, unknown> / unknown) so tools
// can layer Zod parse at the boundary.

export interface ListCommitmentsParams {
  nextToken?: string;
  maxResults?: number;
}

export class AmazonDspV1Service {
  constructor(
    private readonly client: AmazonDspHttpClient,
    private readonly logger: Logger
  ) {}

  async listCommitments(
    params: ListCommitmentsParams,
    context?: RequestContext
  ): Promise<unknown> {
    const query: Record<string, string> = {};
    if (params.nextToken !== undefined) query.nextToken = params.nextToken;
    if (params.maxResults !== undefined) query.maxResults = String(params.maxResults);
    return this.client.get(AMAZON_DSP_V1_PATHS.listCommitments, query, context);
  }

  async retrieveCommitments(
    body: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.client.post(AMAZON_DSP_V1_PATHS.retrieveCommitments, body, context);
  }

  async createCommitments(
    body: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.client.post(AMAZON_DSP_V1_PATHS.createCommitments, body, context);
  }

  async updateCommitments(
    body: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.client.post(AMAZON_DSP_V1_PATHS.updateCommitments, body, context);
  }

  async retrieveCampaignForecast(
    body: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.client.post(AMAZON_DSP_V1_PATHS.retrieveCampaignForecast, body, context);
  }

  async retrieveCommitmentSpend(
    body: Record<string, unknown>,
    context?: RequestContext
  ): Promise<unknown> {
    return this.client.post(AMAZON_DSP_V1_PATHS.retrieveCommitmentSpend, body, context);
  }
}
```

**Step 2: Run tests pass**

```bash
pnpm vitest run tests/services/amazon-dsp-v1-service.test.ts
# expected: PASS (6 tests)
```

**Step 3: Commit**

```bash
git add src/services/amazon-dsp/amazon-dsp-v1-service.ts tests/services/amazon-dsp-v1-service.test.ts
git commit -m "feat(amazon-dsp-mcp): add AmazonDspV1Service with 6 endpoint methods"
```

---

## Phase 3 — Session wiring

### Task 9: Extend SessionServices

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/services/session-services.ts`
- Modify: `packages/amazon-dsp-mcp/tests/mcp-server/amazon-dsp-server-transport.test.ts` (only if existing assertions enumerate SessionServices keys)

**Step 1: Read the current SessionServices definition**

```bash
grep -n "interface SessionServices\|amazonDspService\b" packages/amazon-dsp-mcp/src/services/session-services.ts
```

**Step 2: Add `amazonDspV1Service`**

In `session-services.ts`, add to the `SessionServices` interface:

```ts
amazonDspV1Service: AmazonDspV1Service;
```

In the `createSessionServices` function, construct it using the SAME `AmazonDspHttpClient` instance already built for `amazonDspService`:

```ts
const amazonDspV1Service = new AmazonDspV1Service(httpClient, logger);
return { amazonDspService, amazonDspV1Service, authAdapter, profileId };
```

Add the import at the top:

```ts
import { AmazonDspV1Service } from "./amazon-dsp/amazon-dsp-v1-service.js";
```

**Step 3: Typecheck**

```bash
cd packages/amazon-dsp-mcp
pnpm run typecheck
# expected: no errors
```

**Step 4: Existing tests still pass**

```bash
pnpm vitest run
# expected: all green
```

**Step 5: Commit**

```bash
git add src/services/session-services.ts
git commit -m "feat(amazon-dsp-mcp): expose AmazonDspV1Service through session services"
```

---

## Phase 4 — Read tools (4 tools)

Each read tool follows the same pattern: write failing test → write tool → register in `allTools` → run tests → commit. We do this in 4 sub-phases, one tool at a time, so each commit is independently verifiable.

The `entityIdArgs` / `entityKinds` annotations for governed reads are intentionally omitted for these — they're not partners to governed writes.

### Task 10: `amazon_dsp_list_commitments`

**Files:**
- Create: `packages/amazon-dsp-mcp/tests/tools/amazon-dsp-list-commitments.test.ts`
- Create: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/list-commitments.tool.ts`
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/index.ts`

**Step 1: Failing test**

Assert:
- Tool name = `amazon_dsp_list_commitments`
- Input accepts `profileId`, `nextToken?`, `maxResults?` (11–50)
- Logic calls `amazonDspV1Service.listCommitments`
- Output schema has `{ commitments, nextToken? }`
- `cesteral.kind === "read"`, `contractId === "amazon_dsp.list_commitments.v1"`

Mock `resolveSessionServices` to return a stub with `amazonDspV1Service.listCommitments` returning `{ commitments: [{ commitmentId: "c1", commitmentName: "X" }], nextToken: "abc" }`.

**Step 2: Run test → FAIL**

```bash
pnpm vitest run tests/tools/amazon-dsp-list-commitments.test.ts
```

**Step 3: Write the tool**

Mirror the shape of `src/mcp-server/tools/definitions/get-entity.tool.ts`. Input schema:

```ts
export const ListCommitmentsInputSchema = z.object({
  profileId: z.string().min(1).describe("Amazon DSP Profile ID"),
  nextToken: z.string().optional().describe("Pagination cursor from a prior page"),
  maxResults: z
    .number()
    .int()
    .min(11)
    .max(50)
    .default(50)
    .optional()
    .describe("Page size (11–50, default 50; Amazon spec constraint)"),
});
```

Annotation:

```ts
cesteral: {
  kind: "read",
  platform: "amazon_dsp",
  contractPlatformSlug: "amazon_dsp",
  contractToolSlug: "list_commitments",
  contractId: "amazon_dsp.list_commitments.v1",
  schemaVersion: 1,
} satisfies CesteralReadToolAnnotations,
```

**Step 4: Register in `tools/definitions/index.ts`**

Add `listCommitmentsTool` to the `allTools` array.

**Step 5: Tests pass**

```bash
pnpm vitest run tests/tools/amazon-dsp-list-commitments.test.ts
```

**Step 6: Commit**

```bash
git add src/mcp-server/tools/definitions/list-commitments.tool.ts src/mcp-server/tools/definitions/index.ts tests/tools/amazon-dsp-list-commitments.test.ts
git commit -m "feat(amazon-dsp-mcp): add amazon_dsp_list_commitments tool"
```

---

### Task 11: `amazon_dsp_get_commitments`

Same shape as Task 10. Differences:

- Input: `{ profileId, commitmentIds: z.array(z.string().min(1)).min(1).max(1000) }`
- Output: verbatim multi-status — `{ success: z.array(...), error: z.array(...) }` (use the generated Zod schema `DSPCommitmentMultiStatusResponseSchema` from `src/generated/v1/zod.ts`).
- `responseFormatter` prepends `"<S> succeeded, <E> failed"` to the JSON.
- `contractToolSlug: "get_commitments"`, `contractId: "amazon_dsp.get_commitments.v1"`.

Commit message: `feat(amazon-dsp-mcp): add amazon_dsp_get_commitments tool`

---

### Task 12: `amazon_dsp_get_campaign_forecast`

Same shape. Differences:

- Input: thin wrapper around `DSPRetrieveCampaignForecastRequest` from generated zod, plus `profileId`.
- Output: `DSPCampaignForecastMultiStatusResponseSchema`.
- `responseFormatter` mentions warning count: `"<S> succeeded (<W> with warnings), <E> failed"`.
- `contractToolSlug: "get_campaign_forecast"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_get_campaign_forecast tool`

---

### Task 13: `amazon_dsp_get_commitment_spend`

Same shape. Differences:

- Input: `DSPRetrieveCommitmentSpendRequest` wrapper + `profileId`.
- Output: `DSPCommitmentSpendMultiStatusResponseSchema`.
- `responseFormatter` includes warning count.
- `contractToolSlug: "get_commitment_spend"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_get_commitment_spend tool`

---

## Phase 5 — Governed write tools (2 tools + shared dry-run helper)

### Task 14: Add `commitment` to the entity-kind enum

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/entity-mapping.ts` (or wherever `ENTITY_KIND_MAP` lives — confirmed at `src/mcp-server/tools/utils/dry-run.ts:112`)

**Step 1: Locate the enum**

```bash
grep -rn "ENTITY_KIND_MAP\b" packages/amazon-dsp-mcp/src/ | head
```

**Step 2: Add `commitment` mapping**

Update `ENTITY_KIND_MAP` to add `commitment: "commitment"` (or the actual key shape used — match the existing entries). If no canonical map exists for the v1 surface, just inline the kind in the new tool's annotations — don't shoehorn into the v2 enum.

**Step 3: Commit**

```bash
git add <modified files>
git commit -m "feat(amazon-dsp-mcp): register commitment canonical entity kind"
```

---

### Task 15: Write per-item dry-run helper for commitments

**Files:**
- Create: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/commitment-dry-run.ts`
- Create: `packages/amazon-dsp-mcp/tests/tools/commitment-dry-run.test.ts`

**Step 1: Failing test**

Test cases:
- `runCreateCommitmentsDryRun` with a valid input → `wouldSucceed: true`, `validationSource: "symbolic"`, `expectedStateSource: "synthetic"`, one expected-post-state row per input item.
- `runCreateCommitmentsDryRun` with input missing `committedSpend` → `wouldSucceed: false`, validation error references the missing field.
- `runUpdateCommitmentsDryRun` with input + a stub service whose `retrieveCommitments` returns 2 existing commitments → `expectedStateSource: "server_symbolic_apply"`, projected post-state merges patch over current.

**Step 2: Run → FAIL**

**Step 3: Implement the helper**

Re-use the existing `assertGovernedDryRunResult` from `@cesteral/shared`. Use the generated `DSPCommitmentCreateSchema` / `DSPCommitmentUpdateSchema` from `src/generated/v1/zod.ts` for symbolic validation.

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { assertGovernedDryRunResult, type DryRunResult } from "@cesteral/shared";
import type { AmazonDspV1Service } from "../../../services/amazon-dsp/amazon-dsp-v1-service.js";
import type { RequestContext } from "@cesteral/shared";

export async function runCreateCommitmentsDryRun(
  items: Array<Record<string, unknown>>,
  _service: AmazonDspV1Service,
  _context: RequestContext
): Promise<DryRunResult> {
  // per-item symbolic validation (use generated DSPCommitmentCreateSchema)
  // expectedPostState rows built directly from input (synthetic — no commitmentId yet)
  // ...
  return assertGovernedDryRunResult(
    { /* ... */ },
    "amazon_dsp_create_commitments"
  );
}

export async function runUpdateCommitmentsDryRun(
  items: Array<Record<string, unknown>>,
  service: AmazonDspV1Service,
  context: RequestContext
): Promise<DryRunResult> {
  // per-item symbolic validation (generated DSPCommitmentUpdateSchema)
  // For each item: service.retrieveCommitments({ commitmentIds: [it.commitmentId] })
  // → merge patch over current → expectedPostState row.
  // expectedStateSource: "server_symbolic_apply"
  // ...
  return assertGovernedDryRunResult(
    { /* ... */ },
    "amazon_dsp_update_commitments"
  );
}
```

**Step 4: Tests pass**

**Step 5: Commit**

```bash
git add src/mcp-server/tools/utils/commitment-dry-run.ts tests/tools/commitment-dry-run.test.ts
git commit -m "feat(amazon-dsp-mcp): add per-item dry-run helper for commitment writes"
```

---

### Task 16: `amazon_dsp_create_commitments`

**Files:**
- Create: `packages/amazon-dsp-mcp/tests/tools/amazon-dsp-create-commitments.test.ts`
- Create: `packages/amazon-dsp-mcp/tests/tools/amazon-dsp-create-commitments-dry-run.test.ts`
- Create: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/create-commitments.tool.ts`
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/tools/definitions/index.ts`

**Step 1: Failing tests**

Wet-run test asserts:
- Tool name `amazon_dsp_create_commitments`
- `dispatchedCapability` block: `{ platform: "amazon_dsp", capability: "create_commitments", targetIds: ["<id from success[].commitmentId>"] }`
- `cesteral.kind === "write"`, `requiresValidation: true`, `requiresSimulation: true`
- Multi-status with one success + one error: output preserves both verbatim

Dry-run test asserts:
- `dry_run: true` → no HTTP call to client.post
- Returns shape `{ dryRun: { validationSource: "symbolic", expectedStateSource: "synthetic", ... } }`
- Symbolic catch of missing required field (e.g. `committedSpend`)

**Step 2: Run → FAIL**

**Step 3: Implement the tool**

Input:

```ts
export const CreateCommitmentsInputSchema = z.object({
  profileId: z.string().min(1),
  commitments: z.array(/* generated DSPCommitmentCreateSchema */).min(1).max(1000),
  dry_run: z.boolean().optional().default(false),
});
```

Output:

```ts
export const CreateCommitmentsOutputSchema = z.object({
  result: /* DSPCommitmentMultiStatusResponseSchema */.optional(),
  dryRun: z.unknown().optional(),
  dispatchedCapability: z.object({
    platform: z.literal("amazon_dsp"),
    capability: z.literal("create_commitments"),
    targetIds: z.array(z.string()),
  }),
});
```

Logic:

```ts
const dispatchedCapability = {
  platform: "amazon_dsp" as const,
  capability: "create_commitments" as const,
  targetIds: [] as string[],
};

if (input.dry_run) {
  const dryRun = await runCreateCommitmentsDryRun(input.commitments, v1Service, context);
  return { dryRun, dispatchedCapability };
}

const result = await v1Service.createCommitments({ commitments: input.commitments }, context);
const parsed = DSPCommitmentMultiStatusResponseSchema.parse(result);
dispatchedCapability.targetIds = parsed.success.map((s) => s.commitmentId).filter(Boolean);
return { result: parsed, dispatchedCapability };
```

Annotation:

```ts
cesteral: {
  kind: "write",
  platform: "amazon_dsp",
  contractPlatformSlug: "amazon_dsp",
  contractToolSlug: "create_commitments",
  contractId: "amazon_dsp.create_commitments.v1",
  schemaVersion: 1,
  entityKinds: ["commitment"],
  requiresValidation: true,
  requiresSimulation: true,
} satisfies CesteralWriteToolAnnotations,
destructiveHint: false,
```

**Step 4: Register in `index.ts`**

**Step 5: Tests pass**

**Step 6: Commit**

```bash
git commit -m "feat(amazon-dsp-mcp): add amazon_dsp_create_commitments (governed write)"
```

---

### Task 17: `amazon_dsp_update_commitments`

Same shape as Task 16. Differences:

- Input items use generated `DSPCommitmentUpdateSchema` (requires `commitmentId`).
- Dry-run uses `runUpdateCommitmentsDryRun` (server-symbolic-apply).
- `contractToolSlug: "update_commitments"`, `contractId: "amazon_dsp.update_commitments.v1"`, `capability: "update_commitments"`.

Commit: `feat(amazon-dsp-mcp): add amazon_dsp_update_commitments (governed write)`

---

## Phase 6 — Annotation + coverage tests

### Task 18: Extend `cesteral-annotations.test.ts`

**Files:**
- Modify: `packages/amazon-dsp-mcp/tests/cesteral-annotations.test.ts`

Add assertions:
- 4 read tools (`list_commitments`, `get_commitments`, `get_campaign_forecast`, `get_commitment_spend`) have `cesteral.kind === "read"`.
- 2 write tools have full governed-write block: `requiresValidation: true`, `requiresSimulation: true`, `entityKinds: ["commitment"]`, `dispatchedCapability` on `outputSchema`.

Run: `pnpm vitest run tests/cesteral-annotations.test.ts` → PASS.

Commit: `test(amazon-dsp-mcp): assert v1 commitment-tool annotations`

---

### Task 19: Extend definitions-coverage test

**Files:**
- Modify: `packages/amazon-dsp-mcp/tests/mcp-server/amazon-dsp-definitions-coverage.test.ts`

Add assertion that the 6 new tool slugs are present in `allTools` and that all v1 tool names start with `amazon_dsp_`.

If the existing test enumerates expected tool counts, bump the expected count by 6.

Run: `pnpm vitest run tests/mcp-server/amazon-dsp-definitions-coverage.test.ts` → PASS.

Commit: `test(amazon-dsp-mcp): cover v1 commitment tools in definitions coverage`

---

### Task 20: Extend `schema-size.test.ts`

**Files:**
- Modify: `packages/amazon-dsp-mcp/tests/schema-size.test.ts`

Add assertions that:
- `src/generated/v1/types.ts` is < 200 KB
- `src/generated/v1/zod.ts` is < 200 KB

If either threshold trips later, that's a signal that the root-set filter is too wide and pulled in unrelated schemas.

Run: `pnpm vitest run tests/schema-size.test.ts` → PASS.

Commit: `test(amazon-dsp-mcp): assert v1 generated schema size budget`

---

## Phase 7 — Full validation

### Task 21: Full build + test cycle

**Step 1: Clean + rebuild from scratch**

```bash
cd packages/amazon-dsp-mcp
pnpm run clean
pnpm run build
# expected: prebuild runs generate:schemas, then tsc succeeds
```

**Step 2: Typecheck the whole repo**

```bash
cd ../..
pnpm run typecheck
# expected: no errors anywhere
```

**Step 3: Run full test suite**

```bash
pnpm run test
# expected: all green
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
#   "amazon_dsp_create_commitments"
#   "amazon_dsp_update_commitments"
#   "amazon_dsp_get_campaign_forecast"
#   "amazon_dsp_get_commitment_spend"
kill %1
```

**Step 5: Final commit (only if anything stragglers)**

If everything is already committed, skip. Otherwise commit any test-fix bits with a focused message.

---

## Out of scope (deferred follow-ups)

- Live test harness for commitments (`tests/live/`) — needs a DSP account with committed inventory.
- `cesteral-intelligence` upstream addition of `commitment` to its slug schema (additive, non-blocking).
- CI fetch path for the gitignored `openapi.json` (currently contributor-local).
- Sponsored Ads (`/sb`, non-`/dsp` cross-product) coverage — belongs in a separate `amazon-ads-mcp` package, not here.
