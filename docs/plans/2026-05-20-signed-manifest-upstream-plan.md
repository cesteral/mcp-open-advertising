# Signed-Manifest Upstream Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Each code-bearing task follows @superpowers:test-driven-development.

**Goal:** Publish a shared `@cesteral/contract-hash` package and add a tag-triggered `release.yml` that generates per-package `dist/cesteral-manifest.json` attestation manifests and publishes to npm with provenance.

**Architecture:** A new zero-dependency `@cesteral/contract-hash` package holds the canonical SHA-256 tool-definition hash, shared bit-identically with `cesteral-intelligence` governance. A build-time generator boots each MCP server in-process, reads the raw `tools/list` output (the stock SDK client strips the `cesteral` annotation namespace, so an identity result schema is used), and writes a schema-valid manifest for every package with governed tools. `release.yml` reuses the existing `publish-all.sh` (extended with `--provenance`) as its publish engine.

**Tech Stack:** TypeScript, pnpm workspace + Turborepo, vitest, `@modelcontextprotocol/sdk` (in-memory transport), GitHub Actions, npm provenance (`pnpm pack` + `npm publish --provenance` — pnpm 8.15 has no provenance support).

**Design doc:** `docs/plans/2026-05-20-signed-manifest-upstream-design.md`

---

## Background the engineer needs

- This repo (`cesteral/mcp-open-advertising`) is a pnpm workspace: `@cesteral/shared` + 13 `@cesteral/<platform>-mcp` server packages. Build with `pnpm run build` (Turborepo). When `@cesteral/shared` changes, the whole repo must rebuild.
- A "governed tool" is one whose MCP `annotations` object contains a `cesteral` namespace block (type `CesteralToolAnnotations` in `@cesteral/shared`). Today only `meta_update_entity`, `meta_get_entity`, `dv360_update_entity`, `dv360_get_entity` are governed.
- The manifest output shape is **pinned** to governance's already-merged `CesteralManifestSchema` (`cesteral-intelligence/lib/features/governance/attestation/manifest-schema.ts`). Do not change field names.
- **Critical gotcha:** the MCP server emits `annotations.cesteral` on the wire, but the stock SDK `Client.listTools()` strips it (non-passthrough `ToolAnnotationsSchema`). The generator must read `tools/list` with an identity result schema. Governance does the same and hashes the unstripped tool — so hashes match.
- `dist/` is in every package's `files` array, so `dist/cesteral-manifest.json` ships in the tarball with no `package.json` change.
- Verify after every task with @superpowers:verification-before-completion: run the stated command, read the output, only then proceed.

---

### Task 1: Scaffold the `@cesteral/contract-hash` package

**Files:**
- Create: `packages/contract-hash/package.json`
- Create: `packages/contract-hash/tsconfig.json`
- Create: `packages/contract-hash/vitest.config.ts`
- Create: `packages/contract-hash/README.md`
- Create: `packages/contract-hash/LICENSE.md` (symlink)
- Modify: `package.json` (root — add devDependency)

**Step 1: Create `packages/contract-hash/package.json`**

```json
{
  "name": "@cesteral/contract-hash",
  "version": "1.0.0",
  "description": "Canonical MCP tool-definition hash shared by Cesteral MCP servers and governance",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/cesteral/mcp-open-advertising.git",
    "directory": "packages/contract-hash"
  },
  "homepage": "https://github.com/cesteral/mcp-open-advertising#readme",
  "keywords": ["mcp", "model-context-protocol", "hash", "attestation", "governance"],
  "files": ["dist/", "README.md", "LICENSE.md"],
  "publishConfig": { "access": "public" },
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist *.tsbuildinfo",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@types/node": "^20.17.6",
    "typescript": "^5.9.3",
    "vitest": "^1.6.0"
  }
}
```

There is **no `dependencies` block** — the zero-runtime-dependency constraint is deliberate (governance imports this as a lightweight dependency).

**Step 2: Create `packages/contract-hash/tsconfig.json`** (identical to `packages/shared/tsconfig.json`)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

**Step 3: Create `packages/contract-hash/vitest.config.ts`**

Copy `packages/shared/vitest.config.ts` verbatim (same test defaults).

**Step 4: Create `packages/contract-hash/README.md`**

```markdown
# @cesteral/contract-hash

The canonical tool-definition hash for the Cesteral MCP ecosystem.

`computeDefinitionHash(tool)` returns a SHA-256 (lowercase hex, no prefix)
over the sorted-key JSON projection of an MCP tool's governance-relevant
fields: `name`, `description`, `inputSchema`, `outputSchema`, `annotations`.

Both `cesteral-mcp-servers` (per-release attestation manifest generation)
and `cesteral-intelligence` governance import this function. The two MUST
produce bit-identical output — the golden-vector tests are the contract.

```ts
import { computeDefinitionHash } from "@cesteral/contract-hash";

const hash = computeDefinitionHash({ name: "meta_update_entity", inputSchema, annotations });
```
```

**Step 5: Create the `LICENSE.md` symlink and the `src/` directory**

```bash
ln -s ../../LICENSE.md packages/contract-hash/LICENSE.md
mkdir -p packages/contract-hash/src packages/contract-hash/tests
```

**Step 6: Add root devDependencies for the generator script**

The generator script (Tasks 4–5) imports `@cesteral/contract-hash` (the hash) and `zod` (manifest validation), so both must resolve from the repo root. In the root `package.json` `devDependencies`, add (keep keys sorted):

```json
    "@cesteral/contract-hash": "workspace:*",
    "zod": "3.25.76",
```

`zod` is pinned to `3.25.76` to match `@cesteral/shared` (one zod version across the repo). `@cesteral/contract-hash` sorts first among the keys; `zod` sorts last.

**Step 7: Install and verify resolution**

Run: `pnpm install`
Expected: completes without error; `pnpm-lock.yaml` updated.

Run: `ls -la node_modules/@cesteral/contract-hash`
Expected: a symlink pointing to `../../packages/contract-hash`.

Run: `node -e "import('zod').then(() => console.log('zod resolves from root'))"`
Expected: prints `zod resolves from root`.

**Step 8: Commit**

```bash
git add packages/contract-hash package.json pnpm-lock.yaml
git commit -m "feat(contract-hash): scaffold @cesteral/contract-hash package"
```

---

### Task 2: Implement `computeDefinitionHash` (TDD)

**Files:**
- Test: `packages/contract-hash/tests/contract-hash.test.ts`
- Create: `packages/contract-hash/src/index.ts`

**Step 1: Write the failing test**

Create `packages/contract-hash/tests/contract-hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDefinitionHash } from "../src/index.js";

// Golden vectors. These hashes are the cross-repo contract: governance's
// canonical-hash test suite MUST pin the identical values. Changing the
// algorithm is a coordinated change in both repos.
describe("computeDefinitionHash", () => {
  it("hashes a minimal tool (name only) to a known value", () => {
    expect(computeDefinitionHash({ name: "minimal_tool" })).toBe(
      "c841d980fe5ee2e43ed269187186e58b215204f11c6780b95c2bb794f01c3ef1"
    );
  });

  const demoTool = {
    name: "demo_tool",
    description: "A demo.",
    inputSchema: {
      type: "object",
      properties: { beta: { type: "string" }, alpha: { type: "number" } },
    },
    annotations: {
      readOnlyHint: true,
      cesteral: { kind: "read", contractId: "demo.get.v1" },
    },
  };

  it("hashes a representative tool to a known value", () => {
    expect(computeDefinitionHash(demoTool)).toBe(
      "3a16ab4f8402beec8813d0d46a87c0fe99c9d86a258d854cba995f57d1948b8b"
    );
  });

  it("is invariant to deep key ordering", () => {
    const reordered = {
      annotations: {
        cesteral: { contractId: "demo.get.v1", kind: "read" },
        readOnlyHint: true,
      },
      inputSchema: {
        properties: { alpha: { type: "number" }, beta: { type: "string" } },
        type: "object",
      },
      description: "A demo.",
      name: "demo_tool",
    };
    expect(computeDefinitionHash(reordered)).toBe(computeDefinitionHash(demoTool));
  });

  it("is sensitive to outputSchema", () => {
    const withOutput = { ...demoTool, outputSchema: { type: "object" } };
    expect(computeDefinitionHash(withOutput)).not.toBe(computeDefinitionHash(demoTool));
  });

  it("ignores non-governance fields (title, _meta, execution)", () => {
    const withExtra = { ...demoTool, title: "ignored", _meta: { x: 1 }, execution: {} };
    expect(computeDefinitionHash(withExtra)).toBe(computeDefinitionHash(demoTool));
  });

  it("treats an undefined optional field as absent", () => {
    expect(computeDefinitionHash({ name: "minimal_tool", description: undefined })).toBe(
      computeDefinitionHash({ name: "minimal_tool" })
    );
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cesteral/contract-hash test`
Expected: FAIL — cannot resolve `../src/index.js` (module does not exist).

**Step 3: Write the implementation**

Create `packages/contract-hash/src/index.ts`:

```ts
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { createHash } from "node:crypto";

/**
 * Subset of an MCP tool definition that participates in the canonical
 * governance hash. Only governance-relevant fields are included; non-
 * governance metadata (title, _meta, execution, etc.) is intentionally
 * excluded.
 */
export interface HashableToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

const GOVERNANCE_FIELDS = [
  "name",
  "description",
  "inputSchema",
  "outputSchema",
  "annotations",
] as const;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 over the canonical governance projection of an MCP tool.
 *
 * Stable across key reorderings, sensitive to any change in
 * name/description/inputSchema/outputSchema/annotations (including any
 * nested `cesteral` namespace). Returns lowercase hex, no prefix.
 *
 * This is the cross-repo source of truth: `cesteral-mcp-servers` uses it
 * to generate per-package attestation manifests, and `cesteral-intelligence`
 * governance uses it to hash observed tools. The two MUST stay
 * bit-identical — see the golden-vector tests.
 */
export function computeDefinitionHash(tool: HashableToolDefinition): string {
  const projection: Record<string, unknown> = {};
  for (const field of GOVERNANCE_FIELDS) {
    const v = tool[field as keyof HashableToolDefinition];
    if (v !== undefined) {
      projection[field] = v;
    }
  }
  const canonical = JSON.stringify(sortKeysDeep(projection));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cesteral/contract-hash test`
Expected: PASS — all 6 tests green.

**Step 5: Build and typecheck**

Run: `pnpm --filter @cesteral/contract-hash build && pnpm --filter @cesteral/contract-hash typecheck`
Expected: both succeed; `packages/contract-hash/dist/index.js` and `index.d.ts` exist.

**Step 6: Commit**

```bash
git add packages/contract-hash
git commit -m "feat(contract-hash): implement computeDefinitionHash with golden-vector tests"
```

> **Cross-repo follow-up (not this repo, do not do here):** governance's `lib/features/governance/write-preview/canonical-hash.ts` should become a re-export of `@cesteral/contract-hash`, and governance's test suite should pin the same two golden hashes (`c841d980…`, `3a16ab4f…`). Note this in the PR description.

---

### Task 3: Shared server-boot helper + refactor `check-registry-runtime.mjs`

**Files:**
- Create: `scripts/lib/boot-server.mjs`
- Modify: `scripts/check-registry-runtime.mjs` (refactor onto the helper)

**Step 1: Create `scripts/lib/boot-server.mjs`**

```js
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Shared harness for booting a built MCP server in-process and introspecting
// it over an in-memory transport. Used by check-registry-runtime.mjs (tool
// name-drift check) and generate-manifests.mjs (attestation hashing).

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repository root. */
export const ROOT = join(__dirname, "..", "..");

// A no-op logger satisfying the pino-shaped interface createMcpServer expects.
const SILENT_LOGGER = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "child") return () => SILENT_LOGGER;
      if (prop === "level") return "silent";
      return () => {};
    },
  }
);

/**
 * Boots the built MCP server for `packageDir` (e.g. "meta-mcp"), runs `fn`
 * with a connected MCP Client, and tears everything down afterwards.
 * Requires `pnpm run build` to have produced the server's dist output.
 */
export async function withServerClient(packageDir, fn) {
  const distServerPath = join(ROOT, "packages", packageDir, "dist", "mcp-server", "server.js");
  if (!existsSync(distServerPath)) {
    throw new Error(
      `Built server not found: ${distServerPath}. Run \`pnpm run build\` before this script.`
    );
  }

  const mod = await import(pathToFileURL(distServerPath).href);
  if (typeof mod.createMcpServer !== "function") {
    throw new Error(`${packageDir} does not export createMcpServer from server.js`);
  }

  const server = await mod.createMcpServer(SILENT_LOGGER);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cesteral-tooling", version: "0.0.0" }, { capabilities: {} });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

// The stock SDK ListToolsResultSchema parses each tool through a non-
// passthrough ToolAnnotationsSchema, which silently strips the `cesteral`
// governance namespace. Passing an identity schema to client.request()
// returns the raw `tools/list` result untouched — the exact representation
// governance ingests and hashes.
const IDENTITY_SCHEMA = { parse: (value) => value };

/**
 * Every tool the server advertises over `tools/list`, paginated, as raw wire
 * objects with the `cesteral` annotation namespace intact.
 */
export async function listRawTools(client) {
  const tools = [];
  let cursor;
  do {
    const result = await client.request(
      { method: "tools/list", params: cursor ? { cursor } : {} },
      IDENTITY_SCHEMA
    );
    for (const tool of result.tools ?? []) tools.push(tool);
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
}
```

**Step 2: Refactor `scripts/check-registry-runtime.mjs` onto the helper**

Replace the imports block, the `SILENT_LOGGER`/`__dirname`/`ROOT` constants, and the `bootAndIntrospect` function so the file uses `withServerClient` and `ROOT` from the helper. Concretely:

- Replace the import lines for `dirname`, `fileURLToPath`, `pathToFileURL`, `Client`, `InMemoryTransport`, and the local `__dirname`/`ROOT`/`SILENT_LOGGER` definitions with:

```js
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, withServerClient } from "./lib/boot-server.mjs";

const REGISTRY_PATH = join(ROOT, "registry.json");
```

(`existsSync` is no longer used after this refactor — drop it from the import; keep `readFileSync`.)

- Replace the whole `bootAndIntrospect` function body with:

```js
async function bootAndIntrospect(packageName) {
  return withServerClient(packageName, async (client) => {
    const [tools, prompts] = await Promise.all([
      listAll(client, "listTools"),
      listAll(client, "listPrompts").catch(() => []),
    ]);
    return { tools, prompts };
  });
}
```

`listAll`, `diff`, and `main` are unchanged. `check-registry-runtime.mjs` keeps the stock `client.listTools()`/`listPrompts()` in `listAll` — annotation stripping does not affect tool *names*, which is all this script needs.

**Step 3: Verify nothing regressed**

Run: `pnpm run build && pnpm run check:registry-runtime`
Expected: `registry.json tools/prompts match every server's live MCP advertisement.` (exit 0)

**Step 4: Commit**

```bash
git add scripts/lib/boot-server.mjs scripts/check-registry-runtime.mjs
git commit -m "refactor(scripts): extract shared MCP server-boot harness"
```

---

### Task 4: Manifest pure logic — `toManifestEntry` + `validateManifest` (TDD)

The orchestration script (Task 5) auto-runs on import, so the testable pure logic lives in a separate module. Scripts are tested with a root-level vitest config (the repo's `check:*` scripts are CI-invocation-tested; the manifest derivation needs explicit negative-case coverage that a happy-path CI run cannot give).

**Files:**
- Create: `vitest.config.scripts.ts` (root)
- Modify: `package.json` (root — add `test:scripts` script)
- Test: `scripts/lib/manifest.test.mjs`
- Create: `scripts/lib/manifest.mjs`

**Step 1: Create `vitest.config.scripts.ts` at the repo root**

```ts
import { defineConfig } from "vitest/config";

// Tests for repo tooling under scripts/. Package-level tests run via
// `turbo run test`; this is a separate root-level suite.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs"],
  },
});
```

**Step 2: Add the `test:scripts` script to the root `package.json`**

In `scripts`, after `"test:coverage"`:

```json
    "test:scripts": "vitest run --config vitest.config.scripts.ts",
```

**Step 3: Write the failing test — `scripts/lib/manifest.test.mjs`**

```js
import { describe, it, expect } from "vitest";
import { toManifestEntry, validateManifest } from "./manifest.mjs";

const writeTool = {
  name: "meta_update_entity",
  description: "Update a Meta entity.",
  inputSchema: { type: "object" },
  annotations: {
    destructiveHint: true,
    cesteral: {
      kind: "write",
      platform: "meta_ads",
      contractId: "meta.update_entity.v1",
      schemaVersion: 1,
    },
  },
};

describe("toManifestEntry", () => {
  it("derives a manifest entry from a governed tool", () => {
    const entry = toManifestEntry(writeTool);
    expect(entry).toEqual({
      toolName: "meta_update_entity",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      schemaVersion: "1",
      definitionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("returns null for a tool with no cesteral annotation", () => {
    expect(toManifestEntry({ name: "meta_list_entities", annotations: {} })).toBeNull();
    expect(toManifestEntry({ name: "meta_list_entities" })).toBeNull();
  });

  it("throws on a malformed contractId", () => {
    const bad = { ...writeTool, annotations: { cesteral: { contractId: "nope", schemaVersion: 1 } } };
    expect(() => toManifestEntry(bad)).toThrow(/contractId/);
  });

  it("throws when contractId version disagrees with schemaVersion", () => {
    const bad = {
      ...writeTool,
      annotations: { cesteral: { contractId: "meta.update_entity.v2", schemaVersion: 1 } },
    };
    expect(() => toManifestEntry(bad)).toThrow(/disagrees/);
  });
});

describe("validateManifest", () => {
  const valid = {
    manifestVersion: 1,
    packageName: "@cesteral/meta-mcp",
    packageVersion: "1.0.0",
    generatedAt: "2026-05-20T00:00:00.000Z",
    tools: [
      {
        toolName: "meta_update_entity",
        contractPlatformSlug: "meta",
        contractToolSlug: "update_entity",
        schemaVersion: "1",
        definitionHash: "a".repeat(64),
      },
    ],
  };

  it("accepts a well-formed manifest", () => {
    expect(() => validateManifest(valid)).not.toThrow();
  });

  it("rejects an empty tools array", () => {
    expect(() => validateManifest({ ...valid, tools: [] })).toThrow(/tools/);
  });

  it("rejects a non-hex definitionHash", () => {
    const bad = { ...valid, tools: [{ ...valid.tools[0], definitionHash: "XYZ" }] };
    expect(() => validateManifest(bad)).toThrow(/definitionHash/);
  });

  it("rejects a packageName that is not an @cesteral/*-mcp package", () => {
    expect(() => validateManifest({ ...valid, packageName: "@cesteral/shared" })).toThrow(/packageName/);
  });
});
```

**Step 4: Run the test to verify it fails**

Run: `pnpm run build && pnpm run test:scripts`
Expected: FAIL — cannot resolve `./manifest.mjs`.

**Step 5: Write the implementation — `scripts/lib/manifest.mjs`**

```js
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Pure logic for attestation-manifest generation: derive a manifest entry
// from a raw MCP tool, and validate a manifest against governance's
// CesteralManifestSchema. Kept import-side-effect-free so it is unit-testable
// (the orchestration script generate-manifests.mjs auto-runs on import).

import { z } from "zod";
import { computeDefinitionHash } from "@cesteral/contract-hash";

// contractId is `<platformSlug>.<toolSlug>.v<schemaVersion>` — see
// @cesteral/shared CesteralToolAnnotations. The tool slug may itself contain
// dots, so anchor on the leading platform segment and trailing version.
const CONTRACT_ID_RE = /^([a-z0-9-]+)\.(.+)\.v(\d+)$/;

// Byte-for-byte mirror of governance's CesteralManifestSchema —
// cesteral-intelligence/lib/features/governance/attestation/manifest-schema.ts.
// Keep these in lockstep: a divergence silently accepts manifests governance
// will reject (or vice versa).
const CesteralManifestSchema = z.object({
  manifestVersion: z.literal(1),
  packageName: z.string().regex(/^@cesteral\/[a-z0-9-]+-mcp$/),
  packageVersion: z.string(),
  generatedAt: z.string().datetime(),
  tools: z
    .array(
      z.object({
        toolName: z.string(),
        contractPlatformSlug: z.string(),
        contractToolSlug: z.string(),
        schemaVersion: z.string(),
        definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
      })
    )
    .min(1),
});

/**
 * Builds a manifest tool entry from a raw wire tool, or returns null if the
 * tool is not governed (no `annotations.cesteral`). Throws on a malformed or
 * inconsistent cesteral block — a hard failure so a release never ships a
 * silently-wrong manifest.
 */
export function toManifestEntry(tool) {
  const cesteral = tool?.annotations?.cesteral;
  if (!cesteral) return null;

  const match = CONTRACT_ID_RE.exec(cesteral.contractId ?? "");
  if (!match) {
    throw new Error(
      `${tool.name}: cesteral.contractId ${JSON.stringify(cesteral.contractId)} ` +
        `does not match <platform>.<tool>.v<version>`
    );
  }
  const [, platformSlug, toolSlug, versionInId] = match;

  if (Number(versionInId) !== cesteral.schemaVersion) {
    throw new Error(
      `${tool.name}: contractId version v${versionInId} disagrees with ` +
        `cesteral.schemaVersion ${cesteral.schemaVersion}`
    );
  }

  return {
    toolName: tool.name,
    contractPlatformSlug: platformSlug,
    contractToolSlug: toolSlug,
    schemaVersion: String(cesteral.schemaVersion),
    definitionHash: computeDefinitionHash(tool),
  };
}

/**
 * Validates a manifest object against the CesteralManifestSchema mirror
 * above. Throws an Error listing every violation (path + message); returns
 * nothing on success.
 */
export function validateManifest(manifest) {
  const result = CesteralManifestSchema.safeParse(manifest);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid manifest for ${manifest?.packageName}:\n${issues}`);
  }
}
```

**Step 6: Run the test to verify it passes**

Run: `pnpm run test:scripts`
Expected: PASS — all `toManifestEntry` and `validateManifest` tests green.

**Step 7: Commit**

```bash
git add vitest.config.scripts.ts package.json scripts/lib/manifest.mjs scripts/lib/manifest.test.mjs
git commit -m "feat(scripts): manifest entry derivation + validation with tests"
```

---

### Task 5: Manifest generator — `scripts/generate-manifests.mjs`

**Files:**
- Create: `scripts/generate-manifests.mjs`

**Step 1: Create `scripts/generate-manifests.mjs`**

```js
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Generates dist/cesteral-manifest.json for every MCP server package that
// exposes governed tools (tools carrying an `annotations.cesteral` block).
// The manifest blesses each governed tool's definitionHash; npm provenance
// on the package tarball signs it transitively. Packages with no governed
// tools get no manifest file — governance treats absence as benign
// (`missing_manifest`).
//
// Output shape is pinned to governance's CesteralManifestSchema:
// cesteral-intelligence/lib/features/governance/attestation/manifest-schema.ts
//
// Requires `pnpm run build` first.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, withServerClient, listRawTools } from "./lib/boot-server.mjs";
import { toManifestEntry, validateManifest } from "./lib/manifest.mjs";

const REGISTRY = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf-8"));

async function generateForPackage(packageDir) {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "packages", packageDir, "package.json"), "utf-8")
  );
  const manifestPath = join(ROOT, "packages", packageDir, "dist", "cesteral-manifest.json");

  const tools = await withServerClient(packageDir, listRawTools);
  const entries = tools.map(toManifestEntry).filter((entry) => entry !== null);

  if (entries.length === 0) {
    // No governed tools — make sure no stale manifest ships in the tarball.
    if (existsSync(manifestPath)) rmSync(manifestPath);
    console.log(`  ${pkg.name}: no governed tools — no manifest`);
    return;
  }

  // Deterministic tool ordering so diffs across runs are minimal.
  entries.sort((a, b) => a.toolName.localeCompare(b.toolName));

  const manifest = {
    manifestVersion: 1,
    packageName: pkg.name,
    packageVersion: pkg.version,
    generatedAt: new Date().toISOString(),
    tools: entries,
  };
  validateManifest(manifest);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ${pkg.name}: wrote manifest with ${entries.length} governed tool(s)`);
}

async function main() {
  console.log("Generating cesteral-manifest.json for MCP server packages...");
  for (const server of REGISTRY.servers) {
    await generateForPackage(server.package);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(`\nManifest generation failed: ${error.message}`);
  process.exit(1);
});
```

**Step 2: Run the generator and verify output**

Run: `pnpm run build && node scripts/generate-manifests.mjs`
Expected: prints `wrote manifest with 2 governed tool(s)` for `@cesteral/meta-mcp` and `@cesteral/dv360-mcp`, and `no governed tools — no manifest` for the other 11.

Run: `cat packages/meta-mcp/dist/cesteral-manifest.json`
Expected: valid JSON — `manifestVersion: 1`, `packageName: "@cesteral/meta-mcp"`, a `tools` array of 2 entries (`meta_get_entity`, `meta_update_entity`) each with `contractPlatformSlug: "meta"`, a `schemaVersion` string, and a 64-hex `definitionHash`. (If the `cesteral` fields are missing, the identity-schema read in `boot-server.mjs` is not working — stop and fix.)

Run: `test ! -e packages/dbm-mcp/dist/cesteral-manifest.json && echo "no dbm manifest (correct)"`
Expected: `no dbm manifest (correct)`.

**Step 3: Commit**

```bash
git add scripts/generate-manifests.mjs
git commit -m "feat(scripts): generate dist/cesteral-manifest.json for governed packages"
```

> Note: `dist/cesteral-manifest.json` is build output (`dist/` is git-ignored) — do not commit the generated manifests.

---

### Task 6: Wire the generator + script tests into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Add two steps to the `build-and-test` job**

In `.github/workflows/ci.yml`, in the `build-and-test` job, immediately **after** the `Build` step (`run: pnpm run build`) and before `Check registry → live MCP advertisement`, insert:

```yaml
      - name: Test repo scripts
        run: pnpm run test:scripts

      - name: Generate + validate attestation manifests
        run: node scripts/generate-manifests.mjs
```

`test:scripts` and the generator both need `@cesteral/contract-hash` and the servers built, so they must run after `Build`.

**Step 2: Verify the CI file is well-formed**

Run: `node -e "const yaml=require('node:fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log(yaml.includes('test:scripts') && yaml.includes('generate-manifests.mjs') ? 'steps present' : 'MISSING')"`
Expected: `steps present`.

(Optionally, if `actionlint` is available, run it on the file.)

**Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run script tests and validate attestation manifests on every PR"
```

---

### Task 7: Extend `publish-all.sh` — provenance, contract-hash, manifest generation

**Files:**
- Modify: `scripts/publish-all.sh`

**Step 1: Add `--provenance` argument parsing**

Near the top, alongside `DRY_RUN` / `NPM_ONLY`, add `PROVENANCE=false`. In the `for arg in "$@"` case statement, add a case:

```bash
    --provenance) PROVENANCE=true ;;
```

Update the `--help` text to list `--provenance  Publish npm packages with build provenance attestation`.

**Step 2: Generate manifests right after the build step**

After the `--- Build ---` block (the `pnpm run build` / dry-run echo), add a new block:

```bash
# --- Generate attestation manifests ---
# Writes dist/cesteral-manifest.json into each governed package so it ships
# inside the tarball. Runs after build, before pack-and-inspect.
log "Generating attestation manifests..."
if [ "$DRY_RUN" = true ]; then
  echo "  (dry-run) node scripts/generate-manifests.mjs"
else
  node scripts/generate-manifests.mjs
fi
```

**Step 3: Inspect the `contract-hash` tarball in the preflight**

In the pack-and-inspect block, alongside `inspect_package "packages/shared"`, add:

```bash
inspect_package "packages/contract-hash"
```

**Step 4: Publish `@cesteral/contract-hash` with the libraries**

Immediately after the `@cesteral/shared` publish block (after its abort-on-failure check), add:

```bash
# --- Publish @cesteral/contract-hash ---
# A standalone, zero-dependency library consumed by cesteral-intelligence
# governance. No server package depends on it, so a failure here is recorded
# and reported at the end rather than aborting the server publishes.
log "Publishing @cesteral/contract-hash to npm..."
publish_to_npm "packages/contract-hash" "@cesteral/contract-hash"
```

**Step 5: Rework `publish_to_npm` — `pnpm pack` + `npm publish --provenance`**

`pnpm@8.15.0` has **no provenance support** (verified: `pnpm publish --help` lists no `--provenance`; pnpm gained provenance only in pnpm 9.x). `npm@10.x` *does* support `--provenance` (verified). Rather than a repo-wide, risky pnpm major-version bump (lockfile format change, install-resolution churn), publish via `pnpm pack` — which rewrites `workspace:*` into the tarball, the exact reason the repo avoided plain `npm publish` of a source dir — followed by `npm publish <tarball> --provenance`. npm signs the provenance attestation; it does not care that pnpm built the tarball.

Replace the entire `publish_to_npm` function with:

```bash
publish_to_npm() {
  local pkg_dir="$1"
  local pkg_label="$2"

  local prov_flag=""
  if [ "$PROVENANCE" = true ]; then prov_flag="--provenance"; fi

  if [ "$DRY_RUN" = true ]; then
    echo "  (dry-run) pnpm pack $pkg_dir && npm publish <tarball> --access public $prov_flag"
    return 0
  fi

  # pnpm 8.15 has no provenance support; npm does. `pnpm pack` rewrites
  # workspace:* deps into the tarball (the literal range would otherwise
  # ship and break consumers); `npm publish <tarball>` publishes that exact
  # artifact and, with --provenance, attaches the build attestation.
  local tarball
  tarball="$(cd "$pkg_dir" && pnpm pack --pack-destination "$PACK_TMP" 2>/dev/null | tail -n1)"
  if [ ! -f "$tarball" ]; then
    echo "  FAIL $pkg_label: pnpm pack produced no tarball" >&2
    NPM_PUBLISH_FAILURES+=("$pkg_label")
    return 0
  fi

  local out exit_code
  set +e
  out=$(npm publish "$tarball" --access public $prov_flag 2>&1)
  exit_code=$?
  set -e

  echo "$out"

  if [ "$exit_code" -eq 0 ]; then
    return 0
  fi

  # Here-string (not a pipe) so a fast grep cannot SIGPIPE the upstream echo.
  if grep -qE 'cannot publish over the previously published|EPUBLISHCONFLICT' <<<"$out"; then
    log "  Note: $pkg_label already published at this version — continuing."
    return 0
  fi

  echo "  FAIL $pkg_label: npm publish exited $exit_code (not an 'already published' error)" >&2
  NPM_PUBLISH_FAILURES+=("$pkg_label")
  return 0  # don't abort the loop; failures are reported after the loop
}
```

`PACK_TMP` is the script-scoped temp dir already created (and `trap`-cleaned) by the pack-and-inspect preflight. Also update the now-stale block comments above `publish_to_npm` and above the `@cesteral/shared` publish so they describe the `pnpm pack` → `npm publish` flow rather than `pnpm publish`.

**Step 6: Verify with a dry run**

Run: `pnpm run build && ./scripts/publish-all.sh --dry-run --provenance --npm-only`
Expected: prints `(dry-run) node scripts/generate-manifests.mjs`; every `(dry-run) ... npm publish` line includes `--provenance`; `@cesteral/contract-hash` appears in the publish list.

Run: `npm publish --help 2>&1 | grep -q provenance && echo "npm provenance available"`
Expected: `npm provenance available`.

**Step 7: Commit**

```bash
git add scripts/publish-all.sh
git commit -m "feat(publish): manifest generation, contract-hash, and --provenance"
```

---

### Task 8: Create `release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - "v[0-9]+.[0-9]+.[0-9]+"

# id-token: npm provenance attestation + mcp-publisher GitHub OIDC login.
# contents: write: gh release create.
permissions:
  contents: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm run build

      - name: Typecheck
        run: pnpm run typecheck

      - name: Test
        run: pnpm run test

      - name: Test repo scripts
        run: pnpm run test:scripts

      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" \
            | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

      - name: Authenticate mcp-publisher (GitHub OIDC)
        run: mcp-publisher login github-oidc

      - name: Publish (npm with provenance + MCP Registry)
        run: ./scripts/publish-all.sh --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        run: gh release create "${{ github.ref_name }}" --generate-notes --verify-tag
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`publish-all.sh` does its own `pnpm run build` and `node scripts/generate-manifests.mjs` internally, so the manifests are present before its pack-and-inspect step. The earlier `Build`/`Typecheck`/`Test` steps are the release gate.

**Step 2: Verify the workflow is well-formed**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/release.yml','utf8')" && echo "file readable"`
Expected: `file readable`. If `actionlint` is installed, run it on the file and expect no errors.

**Verification notes (confirm before relying on a real release):**
- `mcp-publisher login github-oidc` is the CI/OIDC auth subcommand — confirm against `mcp-publisher --help` and `docs/guides/mcp-registry-publishing.md`; the interactive flow is `login github`.
- The `NPM_TOKEN` repository secret must exist with **Automation** publish rights on the `@cesteral` npm org (see `docs/guides/publishing.md` § Auth setup).
- npm provenance requires every published `package.json` to carry a `repository` field — the `-mcp` packages and `@cesteral/contract-hash` already do; `@cesteral/shared` does too. No action needed, but re-confirm if a new package is added.

**Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered release workflow with npm provenance"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/guides/publishing.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: Update `docs/guides/publishing.md`**

In the "Release flow (recommended ordering)" section, add a note at the top that the routine path is now the tag-triggered `release.yml`: pushing a `vX.Y.Z` tag runs build + gate + manifest generation + `publish-all.sh --provenance` + MCP Registry + GitHub Release. State that `./scripts/publish-all.sh` remains supported as a manual break-glass fallback (a manual run still generates manifests, but does not produce npm provenance — only CI can). In the "Target 2: npm" section, add a sentence that release builds attach npm provenance and ship `dist/cesteral-manifest.json` inside each governed package's tarball.

**Step 2: Update `CLAUDE.md`**

In the "Monorepo Architecture" section, note the workspace is `@cesteral/shared` + `@cesteral/contract-hash` + one package per MCP server. Add a short subsection (near "Deployment & Infrastructure" or "Publishing") describing the attestation manifest: `scripts/generate-manifests.mjs` writes `dist/cesteral-manifest.json` for packages with governed tools (tools carrying `annotations.cesteral`); the hash comes from `@cesteral/contract-hash`; `release.yml` publishes with npm provenance.

**Step 3: Update `README.md`**

If the README has a package/fleet table, add a row for `@cesteral/contract-hash` (a shared library, not an MCP server — note it has no port/tools). Keep it brief.

**Step 4: Update `CHANGELOG.md`**

Under `## [Unreleased]` → `### Added`, add:

```markdown
- **Release attestation** — new `@cesteral/contract-hash` package (canonical tool-definition hash) and a tag-triggered `release.yml` that publishes to npm with build provenance and ships a `dist/cesteral-manifest.json` attestation manifest inside every governed package's tarball.
```

**Step 5: Verify formatting**

Run: `pnpm run format:check`
Expected: passes (or run `pnpm run format` to fix, then re-check).

**Step 6: Commit**

```bash
git add docs/guides/publishing.md CLAUDE.md README.md CHANGELOG.md
git commit -m "docs: document release attestation manifests and release.yml"
```

---

## Final verification

After all tasks, from a clean state, run the full gate and confirm each line of output:

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run test:scripts
node scripts/generate-manifests.mjs
pnpm run check:registry-runtime
pnpm run format:check
./scripts/publish-all.sh --dry-run --provenance
```

Expected: every command exits 0; `generate-manifests.mjs` writes manifests for `meta-mcp` and `dv360-mcp` only; the dry-run lists `@cesteral/contract-hash` and shows `--provenance` on every `npm publish` line.

Then use @superpowers:finishing-a-development-branch to open a PR. The PR description should call out the cross-repo follow-up: governance's `canonical-hash.ts` becoming a re-export of `@cesteral/contract-hash`, with the two golden hash vectors pinned in governance's tests.
