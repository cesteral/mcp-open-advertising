# Signed-Manifest Upstream Support — `@cesteral/contract-hash` + Release Workflow

**Date:** 2026-05-20
**Status:** Draft / design review
**Owner:** Daniel Thorner
**Repo in scope:** `cesteral/mcp-open-advertising` (this repo). Governance-side
work is tracked separately in `cesteral-intelligence`.
**Companion designs (in `cesteral-intelligence`):**

- `docs/plans/2026-05-19-signed-manifest-attested-trust-design.md` — the
  governance-side attestation system this work feeds. Defines the manifest
  contract, the signer pin, and the trust-transition matrix.
- `docs/plans/2026-05-13-mcp-server-write-contract-declaration.md` — the
  `cesteral.*` annotation rollout. Deliberately phased Meta + DV360 first;
  **not in scope here** (see Non-Goals).

---

## Position

The governance attestation system (`cesteral-intelligence`, Phase 1, already
merged) promotes a tool's `definitionTrust` to `attested` when the tool's
`definitionHash` matches a "blessed" hash published by upstream. Blessed hashes
come from a per-package `dist/cesteral-manifest.json` shipped inside the npm
tarball; npm provenance (`npm publish --provenance` from a tag-triggered
release workflow) signs the tarball, and therefore the manifest, transitively.

This repo currently produces **no manifest** and has **no release workflow** —
publishing is the laptop-run `scripts/publish-all.sh`. Provenance verification
on the governance side pins the publishing identity to
`.github/workflows/release.yml` in `cesteral/mcp-open-advertising` on a
`refs/tags/vX.Y.Z` ref, so laptop publishing can never produce a
provenance-verifiable artifact. This design adds the two upstream pieces the
governance system depends on:

1. A shared, published `@cesteral/contract-hash` package so upstream's manifest
   generator and governance's verifier compute **bit-identical** hashes.
2. A tag-triggered `release.yml` that generates each package's manifest and
   publishes with npm provenance.

## Scope

**In scope** (plan steps 1–2):

- New `@cesteral/contract-hash` package — the canonical hash function,
  published to npm.
- A manifest generator script that writes `dist/cesteral-manifest.json` per
  package.
- `.github/workflows/release.yml` — tag-triggered, provenance-publishing,
  full release pipeline (npm + MCP Registry).
- CI wiring so the generator is continuously exercised.

**Out of scope:**

- The `cesteral.*` annotation rollout to additional servers/tools. It has its
  own phased design and is decoupled by explicit decision. Today only
  `meta-mcp` and `dv360-mcp` carry `cesteral` annotations (on
  `update_entity` + `get_entity`); the manifest generator covers exactly those
  governed tools and grows automatically as that separate rollout proceeds.
- All governance-side work (verifier, blessed-hash map, trust transitions,
  admission tightening, org config). That is steps 3–6 in `cesteral-intelligence`.
- Converting governance's `canonical-hash.ts` into a re-export shim of
  `@cesteral/contract-hash` — a cross-repo follow-up, noted here for context.

## Architecture

### 1. `@cesteral/contract-hash` package

A new workspace package at `packages/contract-hash/`.

- **Zero runtime dependencies** — `node:crypto` only. A single source file
  exports `computeDefinitionHash()` and the `HashableToolDefinition` type,
  copied **verbatim** from governance's
  `lib/features/governance/write-preview/canonical-hash.ts`: SHA-256 over the
  sorted-key JSON projection of `{ name, description, inputSchema,
outputSchema, annotations }`, lowercase hex, no `sha256:` prefix.
- The zero-dependency constraint is deliberate: governance imports this as a
  lightweight dependency. The manifest **schema** (which needs `zod`) stays
  out of this package for that reason.
- Standard repo conventions: `type: module`, `tsc --build`,
  `files: ["dist/", "README.md", "LICENSE.md"]`, `LICENSE.md` symlink to
  repo root, `publishConfig.access: "public"`, and a `repository` field with
  `directory: "packages/contract-hash"` (npm provenance requires it).
- **Versioned independently**, starting at `1.0.0`. It changes only when the
  hash algorithm changes (≈never). The release workflow's existing
  "already published" conflict-tolerance makes republishing an unchanged
  `1.0.0` on later release tags a harmless no-op, so no special-casing is
  needed.
- Tests: golden-vector tests (fixed input → hard-coded expected hash),
  key-order invariance, per-field sensitivity, `undefined`-field omission.
  The golden vectors are the **cross-repo bit-identical contract** —
  governance's test suite pins the same vectors.

No published server package depends on `@cesteral/contract-hash`; only the
in-repo manifest generator (a build-time script) and the external
`cesteral-intelligence` repo consume it.

### 2. Manifest generator — `scripts/generate-manifests.mjs`

**Hashing the raw `tools/list` result.** `definitionHash` must be
bit-identical to what governance computes over the _cached MCP tool_.
Governance (`cesteral-intelligence`,
`lib/features/mcp-connections/client.ts`) issues a raw `tools/list` request,
stores the unmodified tool in `mcp_connection_tools.raw_tool`, and
`computeDefinitionHash` hashes that — `annotations` **including the
`cesteral` namespace** (verified in `tool-cache.ts` /
`drift-detection.ts`). The generator must hash the same representation.

One subtlety drives the implementation. The server emits the full
`cesteral` block inside `annotations` on the wire — verified by
intercepting the raw JSON-RPC `tools/list` result — but the **stock MCP SDK
`Client.listTools()` strips it**: the SDK's `ToolAnnotationsSchema` is a
non-passthrough `z.object`, so Zod drops the unknown `cesteral` key during
client-side result parsing. The generator therefore must NOT use
`client.listTools()`. It boots each server in-process (in-memory
`Client`/`Server` pair, `createMcpServer(SILENT_LOGGER)`, credential-free)
and issues a paginated `tools/list` via `client.request(..., schema)` with
an **identity result schema** (`{ parse: (v) => v }`), so the raw tool
objects — `cesteral` intact — come through unstripped. Hashing the source
Zod definitions instead would require replicating the transport's
Zod→JSON-Schema conversion exactly; any drift there silently breaks every
hash match.

The boot + raw-list logic lives in a shared `scripts/lib/boot-server.mjs`
(`withServerClient`, `listRawTools`); `check-registry-runtime.mjs` is
refactored onto the same `withServerClient` boot helper (it keeps the stock
client for name-only listing — annotation stripping does not affect names).

**Per package:** for every tool whose wire `annotations.cesteral` is present
(both `write` and `read` kind — governance blesses read partners too), emit a
manifest entry:

- `toolName` ← `tool.name`
- `definitionHash` ← `computeDefinitionHash(tool)`
- `contractPlatformSlug` / `contractToolSlug` ← parsed from
  `cesteral.contractId` (e.g. `"meta.update_entity.v1"` → `meta` /
  `update_entity`)
- `schemaVersion` ← `String(cesteral.schemaVersion)`, **asserted equal** to
  the `.v<n>` suffix of `contractId`; a mismatch fails the build (catches
  annotation drift).

Envelope: `{ manifestVersion: 1, packageName, packageVersion, generatedAt,
tools[] }`, written to `packages/<pkg>/dist/cesteral-manifest.json`.

- Packages with **zero** governed tools get **no file** — the schema requires
  `tools` to be non-empty, and an absent manifest is governance's benign
  `missing_manifest`. Today that means manifests for `meta-mcp` and
  `dv360-mcp` only (2 entries each); the other 11 packages emit nothing.
- `dist/` is already in every package's `files` array, so the manifest ships
  in the tarball with no `package.json` change.
- The script validates every manifest it writes against an inline `zod` copy
  of `CesteralManifestSchema` (with a comment pointing at governance's
  `manifest-schema.ts` as the canonical contract) and exits non-zero on any
  invalid manifest.

### 3. `release.yml`

A new `.github/workflows/release.yml`, triggered on a `v[0-9]+.[0-9]+.[0-9]+`
tag push. Permissions: `contents: write` (GitHub Release) and
`id-token: write` (npm provenance).

Pipeline:

1. Checkout, pnpm + Node 22 setup, `pnpm install --frozen-lockfile`.
2. `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:scripts` —
   the release gate.
3. Install + GitHub-OIDC-authenticate `mcp-publisher`.
4. `./scripts/publish-all.sh --provenance` — the publish engine. It
   rebuilds (incremental), runs the manifest generator, inspects every
   tarball, then publishes to npm (with provenance) and the MCP Registry.
5. `gh release create vX.Y.Z`.

There is no version/tag-equality assertion: the repo uses per-package
semver ("bump affected packages"), `publish-all.sh` already tolerates
already-published versions, and npm provenance binds to the tag _ref_
pattern, not to package-version equality. Manifest generation lives
_inside_ `publish-all.sh` (after its build step) so a break-glass manual
run produces manifests too.

**Publish engine: reuse `scripts/publish-all.sh`.** The script is extended
with a `--provenance` flag (gating the `npm publish` step) and confirmed
CI-safe (it is already non-interactive). `release.yml` handles environment
setup — `NPM_TOKEN` for npm auth, `mcp-publisher` install + GitHub-OIDC login
for the MCP Registry — then calls the script. This keeps one source of publish
logic (tarball-inspect preflight, `shared`-first ordering, conflict tolerance,
the MCP Registry loop). The script remains usable as a documented break-glass
manual fallback; `release.yml` becomes the routine path.

Publishing notes:

- **Provenance mechanism: `pnpm pack` + `npm publish --provenance`.** pnpm is
  pinned at `8.15.0`, which has no provenance support at all (verified —
  provenance landed only in pnpm 9.x). npm `10.x` does. Rather than a
  repo-wide pnpm major-version bump, each package is packed with `pnpm pack`
  (which still rewrites `workspace:*` ranges to resolved versions — a plain
  `npm publish` of a source dir would ship the literal string) and the
  resulting tarball is published with `npm publish <tarball> --provenance`.
  npm signs the attestation regardless of which tool built the tarball.
- npm provenance requires a `repository` field in each `package.json`. The
  `-mcp` packages and `@cesteral/shared` already have one; the new
  `@cesteral/contract-hash` adds it.
- npm provenance requires a `repository` field in each `package.json`. The
  `-mcp` packages already have one; verify all packages (including the new
  `@cesteral/contract-hash`) carry it.
- `@cesteral/contract-hash` is added to `publish-all.sh`'s
  libraries-published-first group, alongside `@cesteral/shared`.

### 4. CI & cross-cutting

- **`ci.yml`**: a new step after `build` runs `generate-manifests.mjs`. The
  publish wiring runs only on tags, so this continuously exercises the risky
  logic — generator + schema validation + the `contractId`/`schemaVersion`
  consistency assertion — on every PR.
- Doc updates: `docs/guides/publishing.md` (release.yml is the routine path),
  `CLAUDE.md` and `README.md` (new package), `CHANGELOG.md`.

## Manifest contract (pinned)

The generator's output must satisfy governance's already-merged
`CesteralManifestSchema` (`cesteral-intelligence`,
`lib/features/governance/attestation/manifest-schema.ts`):

```ts
{
  manifestVersion: 1,                              // literal
  packageName: string,                             // /^@cesteral\/[a-z0-9-]+-mcp$/
  packageVersion: string,                          // strict-match installed version
  generatedAt: string,                             // ISO 8601 datetime
  tools: Array<{                                   // non-empty
    toolName: string,
    contractPlatformSlug: string,
    contractToolSlug: string,
    schemaVersion: string,
    definitionHash: string,                        // /^[0-9a-f]{64}$/
  }>,
}
```

## Risks & cross-repo coordination

- **Hash divergence is the one catastrophic failure** — it is silent: every
  attestation simply stops matching. Mitigated by hashing the raw
  `tools/list` result with the `cesteral` namespace intact (the exact
  representation governance ingests and hashes — not the SDK-stripped
  `client.listTools()` output) and by shared golden hash vectors pinned in
  both repos' test suites.
- **Manifest schema coupling.** The generator's output is pinned to
  governance's `manifest-schema.ts`. The inline `zod` copy in the generator
  carries a pointer comment; any change to the manifest contract is a
  coordinated cross-repo change.
- **`contractId` ↔ `schemaVersion` consistency** is build-enforced by the
  generator's assertion.
- **`release.yml` only runs on tags.** Its publish path cannot be exercised
  by PR CI. Mitigation: the generator (the non-trivial logic) runs in `ci.yml`
  on every PR; the YAML publish wiring is covered by review and a first
  rehearsed release.

## Success criteria

1. `@cesteral/contract-hash` publishes to npm with `computeDefinitionHash`
   producing output bit-identical to governance's `canonical-hash.ts`,
   verified by shared golden vectors.
2. `scripts/generate-manifests.mjs` writes a schema-valid
   `dist/cesteral-manifest.json` for every package with ≥1 governed tool
   (`meta-mcp`, `dv360-mcp` today) and no file for packages with none.
3. The generator fails the build on a malformed `contractId` or a
   `contractId`/`schemaVersion` mismatch.
4. `ci.yml` runs the generator on every PR.
5. `release.yml` triggers on a `vX.Y.Z` tag, generates manifests, and
   publishes all packages (including `@cesteral/contract-hash`) to npm with
   `--provenance` and to the MCP Registry, reusing `publish-all.sh`.
6. A published `-mcp` tarball contains `dist/cesteral-manifest.json` when the
   package has governed tools.
7. `docs/guides/publishing.md` documents `release.yml` as the routine release
   path.

## Open choices — resolved during design review

1. **`@cesteral/contract-hash` vs folding into `@cesteral/contract-schema`.**
   No `@cesteral/contract-schema` exists in this repo; folding into
   `@cesteral/shared` would force governance to import a heavy package.
   Decision: **new, zero-dependency `@cesteral/contract-hash`**.
2. **Annotation rollout scope.** Decision: **decoupled** — ship the
   manifest machinery now; manifest coverage grows as the separate
   write-contract-declaration plan proceeds.
3. **`release.yml` coverage.** Decision: **full pipeline** — npm (with
   provenance) + MCP Registry; `release.yml` is the routine path.
4. **`release.yml` publish engine.** Decision: **reuse `publish-all.sh`**
   (extended with `--provenance`) rather than reimplementing publish steps in
   workflow YAML.
