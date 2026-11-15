# New-Server Scaffold Implementation Plan (PR 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm new:server <key>` generates a complete management server (package, registry entry, platform facts and every hand-maintained fleet list), and a CI job proves on every PR that a freshly generated server passes the fleet's checks except an exact, asserted to-do list.

**Architecture:** Template files live in `templates/server/management/`, outside `packages/`, so no fleet check discovers them and they can never be published. A pure library under `scripts/scaffold/` renders them and computes every edit before writing anything. `scripts/new-server.mjs` is a thin CLI over it. A smoke script generates a throwaway server in a temporary git worktree, runs the normal checks there, and compares the failures to the expected to-do list.

**Tech Stack:** Node 26 ESM scripts (`.mjs`, no dependencies), vitest via `vitest.config.scripts.ts`, pnpm 10.34.5, GitHub Actions.

**Spec:** the _Design_ section below (decisions taken with the user on 2026-11-15), plus [the platform-key and contract decision record](2026-10-11-platform-keys-and-contract-decisions.md) for keys and tiers.

## Design

- **Template outside the workspace.** It lives in `templates/server/management/`, holding the files of one server with `{{placeholders}}`. It is not a package and has no `package.json` at its root, so the `packages/*-mcp` discovery the checks use never sees it.
- **The template proves itself by being used.** The `scaffold-smoke` CI job generates `zzscaffold` and runs the fleet checks on the result. A fresh server must pass everything except a checked to-do list: wire-request tests citing a real vendor source, which only a person can write. The smoke asserts that exact failure set, so the scaffold never fakes a vendor citation and never leaves an unlisted gap.
- **Management write tools are generated as governed stubs.** That means full `cesteral` annotations, `readPartner`, `terminalOperations` for delete, and dry-run wiring. `logic` throws `McpError(JsonRpcErrorCode.InternalError, "not implemented: …")` until the author replaces it.
- **One key everywhere (#273).** The key is the tool prefix, `tool_prefix`, `platform_key`, every `cesteral.platform` and `contractPlatformSlug`, the telemetry `platform`, the rate-limiter and span key, and the platform-facts id prefix. The package is `<key with _ → ->-mcp` and the env prefix is `<KEY>_`.
- **Only `--type management` is supported in this PR.** `reporting` and `reporting_conversions` exit with "not supported yet; see docs/plans/2026-11-15-new-server-scaffold.md (PR 3)", because a server that isn't governed fails `governed-packages` until PR 3 adds the allowlist.
- **All or nothing.** Every edit is computed and validated in memory first. Nothing is written if any edit fails, and `--dry-run` writes nothing.

## Global Constraints

- Key: `/^[a-z][a-z0-9_]{1,39}$/`; unique across registry `platform_key` and `tool_prefix`.
- Port: default = highest registry `port` + 1; must be unique; checked against the generated config's `port … .default(N)`.
- Template placeholders: `{{key}}` (`foo_bar`), `{{package}}` (`foo-bar-mcp`), `{{Pascal}}` (`FooBar`), `{{ENV}}` (`FOO_BAR`), `{{displayName}}`, `{{port}}`, `{{baseUrl}}`, `{{docsUrl}}`, `{{rateLimitPerMinute}}`. Rendered output must contain no `{{`.
- New platform facts: `status: "unverified"`, `verifiedAt: null`, `verifyBy` = today + 180 days (`REFRESH_DAYS` cadence for `unversioned-base-url` and `behavioral-constraint`; anything later is `DEADLINE PARKED`).
- Scripts: plain Node, no new dependencies; every new `.mjs` has a vitest file beside it.
- Repo practice: rely on CI, not full local runs ([[rely-on-ci-not-local-runs]]); run prettier on everything written.

## Review Focus

1. **A multi-word key (`foo_bar`).** Expect package `foo-bar-mcp`, env `FOO_BAR_`, Terraform keys `"foo-bar-mcp"`, and everything else `foo_bar`. Pinned in Task 2 (`names()`) and Task 4.
2. **A key or port already taken.** Exit 2 naming the owner, with nothing written. Pinned in Task 4.
3. **Running twice, or `packages/<package>` already exists.** Exit 2 with nothing written, no partial edits. Pinned in Task 4.
4. **A hand-maintained file reformatted so an inserter can't find its anchor.** Throw naming the file and the list, never skip silently. Pinned in Task 1.
5. **The generated server moves the lexical routing baseline or the tool-search ranking evals.** That is a real regression of the scaffold's tool text, not a to-do. The smoke must fail on it, not tolerate it. Pinned in Task 5 by the exact-set comparison.

---

### Task 1: Site inserters for every hand-maintained fleet list

**Files:**

- Create: `scripts/scaffold/sites.mjs`, `scripts/scaffold/sites.test.mjs`

**Interfaces:**

- Consumes: `INVENTORY_SITES`, `CENSUS`, `checkFleetInventory(root, registry)` from `scripts/lib/fleet-inventory.mjs`
- Produces:
  - `SITE_INSERTERS: Record<string /* repo-relative file */, (text: string, s: ScaffoldServer) => string>`
  - `type ScaffoldServer = { key: string; package: string; Pascal: string; ENV: string; authMode: string; secretEnvVars: Record<string, { secret_name: string; version: string }> }`
  - `insertIntoSites(readFile: (p) => string, s: ScaffoldServer): Map<string, string>` (file → new text)
  - `insertReadmeRow(text: string, s: ScaffoldServer & { displayName: string; toolCount: number; authLabel: string }): string`: appends a row to `README.md`'s fleet table, which `check:doc-tool-counts` reads. It is not an inventory site, so it has its own export.

Each inserter appends `s` after the last entry of its list, keeping the file's indentation and formatting:

- `cloudbuild*.yaml`: both `images:` tags
- `terraform/main.tf`: `service_auth_defaults` = `s.authMode`
- `terraform/variables.tf`: an `mcp_secret_env_vars` default entry
- `terraform/{dev,prod}.tfvars.example`: an `mcp_images` entry with that file's placeholder project
- the three issue forms' server dropdowns, plus `s.authMode` in `bug_report.yml`'s auth-mode dropdown if it is absent
- `docs/CROSS_SERVER_CONTRACT.md` and `docs/guides/platform-mapping.md`: one row each

- [ ] **Step 1: Write the failing tests** in `sites.test.mjs`:
  - `"every inventory site file has an inserter"`: `[...new Set(INVENTORY_SITES.map(s => s.file))].every(f => f in SITE_INSERTERS)`. A future hand-maintained list then forces an inserter.
  - `"after insertion every site lists the new server"`: run `insertIntoSites` on the real files for a fake `zzscaffold` server. Run `checkFleetInventory` against a registry with `zzscaffold-mcp` appended, reading each file from the inserted map or, where absent, from disk. Expect no violation that mentions a site file. The registry-vs-workspace "does not exist" line is expected, because no package directory exists in this test.
  - `"a missing anchor throws, naming the file"`: give the `terraform/main.tf` inserter text without `service_auth_defaults = {`, and expect it to throw `/terraform\/main\.tf.*service_auth_defaults/`.
  - `"a multi-word key uses package spelling where lists hold packages"`: for key `foo_bar`, the inserted `main.tf` contains `"foo-bar-mcp" =`.
  - `"the README row satisfies check:doc-tool-counts"`: after `insertReadmeRow` with `toolCount: 9`, the parser `scripts/check/check-doc-tool-counts.mjs` uses reads `zzscaffold-mcp` with count 9.
- [ ] **Step 2: Run** `./node_modules/.bin/vitest run --config vitest.config.scripts.ts scripts/scaffold/sites.test.mjs`. Expect FAIL (module not found).
- [ ] **Step 3: Implement `SITE_INSERTERS` and `insertIntoSites`** in `sites.mjs`. Find each anchor with the same regexes `fleet-inventory.mjs` uses for that site. Throw `Error(\`${file}: cannot find <list> to insert into\`)` when an anchor is missing.
- [ ] **Step 4: Run the test.** Expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): insert a new server into every hand-maintained fleet list`

### Task 2: Names, registry entry and platform facts

**Files:**

- Create: `scripts/scaffold/entries.mjs`, `scripts/scaffold/entries.test.mjs`

**Interfaces:**

- Consumes: `checkRegistryKeys(registry)` from `scripts/lib/platform-keys.mjs`, and `checkContractTiers(registry)` from `scripts/lib/contract-tiers.mjs`
- Produces:
  - `type ScaffoldOptions = { key: string; displayName: string; type: "management"; port?: number; baseUrl: string; docsUrl: string; rateLimitPerMinute: number }`
  - `names(key: string): { key; package; Pascal; ENV }`
  - `nextFreePort(registry): number`
  - `buildRegistryEntry(opts: ScaffoldOptions, registry, tools: string[]): object`. It returns a full entry:
    - every field the existing entries have
    - `governed: true`, `type: "management"`, `platform_key = tool_prefix = key`
    - `auth.modes: [\`${key}-bearer\`, "jwt", "none"]`
    - `untrustedContent: { pathReporting: "per-response" }`
    - `operational.terminalOperations` listing `${key}_delete_entity`
    - `contract.exceptions` for every SHOULD the template does not ship (`duplicate_entity`, `bid_adjustment`, `account_discovery`, `reporting`), each with the reason `"Not generated by the scaffold; add the tool or keep this reason"`, padded to at least 20 characters
  - `buildPlatformFacts(opts, today: string /* YYYY-MM-DD */): object[]`. It returns two facts, `${key}.api_base` (`unversioned-base-url`) and `${key}.rate_limit_default` (`behavioral-constraint`), with `codeRefs` pointing at `packages/<package>/src/config/index.ts:<line>`. The template's config fixes the line numbers; export them from Task 3 as `CONFIG_LINES`.

- [ ] **Step 1: Write the failing tests:**
  - `names("foo_bar")` deep-equals `{ key: "foo_bar", package: "foo-bar-mcp", Pascal: "FooBar", ENV: "FOO_BAR" }`.
  - `nextFreePort` of the real registry equals 3014.
  - Append `buildRegistryEntry(opts, registry, TEMPLATE_TOOLS(key))` to the real registry. Then `checkRegistryKeys` returns `[]`, and `checkContractTiers` returns `[]`.
  - `buildPlatformFacts(opts, "2026-11-15")[0].verifyBy === "2027-05-14"`, and both facts pass `validateLedger({ facts: [...realFacts, ...new] })` from `scripts/check/check-platform-facts.mjs`.
- [ ] **Step 2: Run** `vitest run --config vitest.config.scripts.ts scripts/scaffold/entries.test.mjs`. Expect FAIL.
- [ ] **Step 3: Implement the four functions** in `entries.mjs`.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): registry entry and platform facts for a new server`

### Task 3: The management template and renderer

**Files:**

- Create: `templates/server/management/**`. Derive each file from `packages/pinterest-mcp` with names replaced by placeholders and platform logic removed:
  - `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, `CLAUDE.md`
  - `src/index.ts`, `src/config/index.ts`, `src/utils/platform.ts`
  - `src/auth/{{key}}-auth-adapter.ts`, `src/auth/{{key}}-auth-strategy.ts`
  - `src/services/session-services.ts`
  - `src/services/{{key}}/{{key}}-http-client.ts`, `src/services/{{key}}/{{key}}-service.ts`
  - `src/mcp-server/server.ts`, `src/mcp-server/transports/streamable-http-transport.ts`
  - `src/mcp-server/tools/{index.ts,utils/entity-mapping.ts,utils/resolve-session.ts}`
  - `src/mcp-server/tools/definitions/*.tool.ts`
  - `src/mcp-server/resources/**`, `src/mcp-server/prompts/index.ts`
  - `tests/tool-registration.test.ts`, `tests/auth-fingerprint.test.ts`
- Create: `scripts/scaffold/render.mjs`, `scripts/scaffold/render.test.mjs`

**Interfaces:**

- Produces:
  - `renderTemplate(templateDir: string, vars: Record<string,string>): Map<string /* path relative to the package */, string>`. Placeholders are replaced in paths and contents.
  - `TEMPLATE_TOOLS(key): string[]`, the tools the template registers:
    - `${key}_list_entities`, `_get_entity`
    - `_create_entity`, `_update_entity`, `_delete_entity`, `_bulk_update_status` (governed stubs)
    - `_validate_entity` (`createValidateEntityTool`), `_get_pacing_status` (`createPacingTool`), `_search_tools` (`createToolSearchTool`)
  - `CONFIG_LINES: { baseUrl: number; rateLimit: number }`, the 1-based lines of `{{baseUrl}}` and `default({{rateLimitPerMinute}})` in the template config.

Requirements:

- Write stubs carry the same annotation shape as Pinterest's:
  - `kind: "write"`, `writeClass: "entity"`; for bulk status, `writeClass: "effect"` with `operation: ["bulk_job"]`
  - `contractId: "{{key}}.<tool>.v1"`
  - `readPartner: { toolName: "{{key}}_get_entity", argMap }`, where `argMap` covers `entityType` and the account id
- Every tool declares `untrustedContent`. Read tools declare `{ structuredPaths: ["$.entity" or "$.entities"], contentBlocks: [0] }`; stubs declare `NO_UNTRUSTED_CONTENT`.
- Account-scoped tools call `assertAccountScope` (`scripts/check/check-account-scope.mjs`).
- `server.ts` exports `{{key}}WorkflowIdByToolName` covering every tool except `_search_tools`, passes `resolveManifestEntry`, and registers both shared cross-platform prompts.

- [ ] **Step 1: Write the failing tests** in `render.test.mjs`:
  - `"renders every file with no placeholder left"`: render with `foo_bar` vars, and no output path or content contains `{{`.
  - `"paths use the key"`: the output contains `src/auth/foo_bar-auth-adapter.ts`.
  - `"CONFIG_LINES point at the values"`: the rendered config's lines `CONFIG_LINES.baseUrl` and `.rateLimit` contain the base URL and `default(25)`.
  - `"TEMPLATE_TOOLS matches the rendered tool barrel"`: every `TOOL_NAME`/`toolName` literal, plus the search tool, equals `TEMPLATE_TOOLS("foo_bar")`.
- [ ] **Step 2: Run** `vitest run --config vitest.config.scripts.ts scripts/scaffold/render.test.mjs`. Expect FAIL.
- [ ] **Step 3: Write the template files and `renderTemplate`.** The renderer is a recursive directory read plus a global string replace per placeholder.
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): management server template`

### Task 4: `pnpm new:server`

**Files:**

- Create: `scripts/new-server.mjs`, `scripts/scaffold/scaffold.mjs`, `scripts/scaffold/scaffold.test.mjs`
- Modify: `package.json`, adding `"new:server": "node scripts/new-server.mjs"`

**Interfaces:**

- Consumes: Tasks 1–3. It builds the `ScaffoldServer` for Task 1 as `{ ...names(opts.key), authMode: \`${opts.key}-bearer\`, secretEnvVars: { MCP_AUTH_SECRET_KEY: { secret_name: "cesteral-jwt-secret-key", version: "latest" } } }`. Only the JWT key is generated. Pinterest's entry also maps its env-credential secrets (`PINTEREST_ACCESS_TOKEN`, `\_AD_ACCOUNT_ID`, `\_APP_ID`, `\_APP_SECRET`, `\_REFRESH_TOKEN`) for its `none`/`jwt` fallback, but a reference to a secret not yet created in Secret Manager fails a deploy. So the platform's credential secrets are on the generated README's to-do list, not invented here.
- Produces:
  - `planScaffold(root: string, opts: ScaffoldOptions, today: string): { writes: Map<string /* repo-relative */, string>, created: string[], modified: string[] }`. It is pure: it reads files, writes nothing, and throws `ScaffoldError` on invalid input.
  - `applyPlan(root, plan): void`
  - CLI flags: `<key> --display-name --base-url --docs-url [--type management] [--port N] [--rate-limit 25] [--dry-run]`
  - Exit codes: 0 ok, 2 invalid input or already exists

- [ ] **Step 1: Write the failing tests** in `scaffold.test.mjs`. Use a temp copy of `registry.json`, `platform-facts.json`, the `README.md` fleet table and every `INVENTORY_SITES` file, made with `mkdtempSync`.
  - `"plans a package, registry entry, facts and every site, and writes nothing"`: the plan's `created` includes `packages/foo-bar-mcp/package.json`. `modified` includes `registry.json`, `platform-facts.json`, `README.md` and every site file. The temp dir is unchanged afterwards.
  - `"refuses a taken key, prefix or port"`: `key: "msads"` throws `/platform_key "msads" .*msads-mcp/`, and `port: 3013` throws `/port 3013 .*msads-mcp/`.
  - `"refuses an existing package and writes nothing"`: create `packages/foo-bar-mcp/`, and expect a throw; no file changes.
  - `"refuses an unsupported type"`: `type: "reporting"` throws `/not supported yet.*PR 3/`.
  - `"applyPlan then fleet-inventory, contract-tiers and platform-keys static checks pass"` on the temp dir.
- [ ] **Step 2: Run** `vitest run --config vitest.config.scripts.ts scripts/scaffold/scaffold.test.mjs`. Expect FAIL.
- [ ] **Step 3: Implement `planScaffold`, `applyPlan` and the CLI.** Run prettier on every written file through the repo's `./node_modules/.bin/prettier`. Print each created and modified path, then the to-do list from `README.md`'s "Before this server can merge".
- [ ] **Step 4: Run it.** Expect PASS.
- [ ] **Step 5: Commit** `feat: pnpm new:server`

### Task 5: The scaffold smoke in CI

**Files:**

- Create: `scripts/scaffold/smoke.mjs`, `scripts/scaffold/expected-todo.mjs`, `scripts/scaffold/expected-todo.test.mjs`
- Modify: `.github/workflows/ci.yml`, adding a job `scaffold-smoke` with `needs: build-and-test`. Its steps are checkout, setup, `pnpm install --frozen-lockfile`, then `node scripts/scaffold/smoke.mjs`.

**Interfaces:**

- Produces:
  - `expectedTodoFailures(key: string): string[]`. These are the full vitest names of the `scripts/lib/wire-request-coverage.test.mjs` cases that fail for the generated write tools, `${key}_create_entity`, `_update_entity`, `_delete_entity` and `_bulk_update_status`, in that test's naming format.
  - `smoke.mjs` does the following:
    1. Creates a temporary `git worktree add --detach <tmp> HEAD`.
    2. Runs `planScaffold`/`applyPlan` with key `zzscaffold`, display name `ZZ Scaffold`, base URL `https://api.example.invalid/v1` and today's date.
    3. Runs `pnpm install --no-frozen-lockfile` and `pnpm run build`.
    4. Runs `check:registry` (after `generate:registry`), `check:registry-tools`, `check:doc-tool-counts`, `check:account-scope` and `check:platform-facts`.
    5. Runs `vitest run --config vitest.config.scripts.ts --reporter=json --outputFile=<tmp>/r.json`.
    6. Exits 1 unless the set of failed test full names equals `expectedTodoFailures("zzscaffold")`. Otherwise it prints the unexpected and the missing names.
    7. Runs `scripts/conformance-test.sh zzscaffold-mcp`.
    8. Always removes the worktree.

- [ ] **Step 1: Write the failing test** `expected-todo.test.mjs`: `"names match the wire-coverage test's case names"`. Import the case-name builder `wire-request-coverage.test.mjs` uses, or reproduce its `it.each` title format. Then assert `expectedTodoFailures("x")` names exactly the four tools.
- [ ] **Step 2: Run it.** Expect FAIL.
- [ ] **Step 3: Implement `expected-todo.mjs`, `smoke.mjs` and the CI job.**
- [ ] **Step 4: Run** `node scripts/scaffold/smoke.mjs` once locally to confirm the expected set. This is the single targeted local run this plan asks for. Expect exit 0 and `failed = expected (4)`.
- [ ] **Step 5: Mutation check.** In the temp worktree, delete the generated `${key}_delete_entity` entry from `terminalOperations`. Expect the smoke to fail and report the unexpected `terminal-operations` failure. Do this by temporarily editing `entries.mjs` behind a backup, then restore it.
- [ ] **Step 6: Commit** `ci: scaffold smoke proves a generated server passes the fleet checks`

### Task 6: Point the guide and CONTRIBUTING at the scaffold

**Files:**

- Modify: `docs/guides/adding-a-new-server.md` (a new "Quick start" section right after the intro), `CONTRIBUTING.md` (the "New MCP servers" bullet)

- [ ] **Step 1: Write the quick start.** Give the exact command and the to-do list from the generated `README.md`, and say the smoke keeps the template working. Leave the rest of the guide untouched: shrinking it is PR 2.
- [ ] **Step 2: Run** `./node_modules/.bin/prettier --check` on both files. Expect clean.
- [ ] **Step 3: Commit** `docs: start the new-server guide with pnpm new:server`

---

## After this PR

- **PR 2:** shrink `adding-a-new-server.md` from about 1,900 lines to about 300, pointing at template files the smoke keeps working.
- **PR 3:** staged read-only contributions:
  - replace "dbm-mcp is the only ungoverned server" with a reasoned allowlist
  - add a registry `experimental` status that keeps a server out of publish and deploy
  - add `reporting` and `reporting_conversions` templates, each with a smoke run
