# Experimental Servers and Staged Read-Only Contributions (PR 3a of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A contributor can land a new platform as an _experimental_, read-only server whose CI is fully green, then add its write tools and `pnpm promote:server` it into publish and deploy.

**Architecture:** Every registry entry gains `status: "experimental" | "stable"`. Publish and deploy read only stable servers (`scripts/fleet.mjs deployable`, Terraform's `for_each`), and the fleet-inventory deploy sites expect only stable servers; CI builds, tests and conformance-runs every server. `governed: false` becomes a rule (a server with no write tools) instead of a hard-coded `dbm-mcp`. `contract-tiers` holds an experimental server to its type's read requirements only. `pnpm new:server` generates an experimental read-only server by default (`--with-writes` keeps PR 1's governed stubs); `pnpm promote:server` flips the status and adds the deploy-list entries.

**Tech Stack:** ESM `.mjs` scripts with no dependencies, vitest (`vitest.config.scripts.ts`), Terraform, Cloud Build YAML, bash.

**Spec:** the decisions taken 2026-11-16, revised by the 2026-11-16 design review (conditional manifest wiring, full-contract promotion, a tested read-only → writes → stable journey, behavioural deploy checks), (ungoverned = "no writes" rule; experimental = out of publish and deploy, `new:server` generates experimental, `promote:server` graduates; experimental servers may ship read-only, writes at promotion; PR 3 split into 3a policy and 3b reporting templates), on top of `docs/plans/2026-11-15-new-server-scaffold.md` and `docs/plans/2026-10-11-platform-keys-and-contract-decisions.md` decision 5.

## Global Constraints

- `status` is required on every registry entry, one of `"experimental"`, `"stable"`. All 13 existing servers are `"stable"`.
- _Deployable_ means `status === "stable"`. Publish (npm and MCP Registry), Cloud Build image builds and deploys, `deploy.sh`, `smoke-test.sh`, Terraform services, and the hand-maintained deploy lists (`cloudbuild*.yaml` `images:`, `terraform/main.tf` `service_auth_defaults`, `terraform/variables.tf` `mcp_secret_env_vars`, `terraform/{dev,prod}.tfvars.example` `mcp_images`) cover deployable servers only. Everything else (CI, conformance, `dev-server.sh`, issue forms, the docs tables, README) covers every server.
- `governed: false` ⇔ the server's live `tools/list` has no tool with `readOnlyHint: false`.
- An experimental server is checked against its type's **read** requirements only; write requirements (`create_entity`, `update_entity`, `delete_entity`, `bulk_update_status`, `duplicate_entity`, `bid_adjustment`, `conversion_upload`) apply at `stable`.
- `pnpm new:server` writes `status: "experimental"`; without `--with-writes` the server has no write tools, `governed: false`, and no `manifestUrl` in `server.ts` (`packages/shared/tests/governance/definition-hash-resolver-coverage.test.ts` forbids it on an ungoverned server).
- The scaffold records a `contract.exceptions` entry for every SHOULD the server lacks, write SHOULDs included. They are tolerated while experimental and carried into `stable`, so promotion needs no new ones; replacing their scaffold reasons is on the to-do list.
- **Who owns the transition.** The contributor implements the writes. `pnpm new:server <key> --add-write-stubs` starts them on an existing read-only server: it writes the write-only template files, re-renders each template file that carries a `{{#writes}}` section only where the file is still byte-identical to its read-only render (otherwise it prints the exact lines to add), and sets `governed: true`, the terminal operation and the registry `tools`. `pnpm promote:server` owns only the status flip and the deploy-list entries, and refuses unless the candidate stable entry passes the **whole** `checkContractTiers` (MUSTs and SHOULD exceptions).
- **Promotion proves contract completeness, not implementation readiness.** Correctly named, governed write stubs promote; the wire-request coverage check still blocks merging until each write has a wire test.
- `pnpm promote:server <key>` exits 2, writing nothing, when the server is unknown, not experimental, or its entry with `status: "stable"` fails `checkContractTiers`.
- One `fleet.mjs` subcommand per list: `servers` (all, unchanged) and `deployable` (new).
- Reporting templates are PR 3b; `--type reporting` still exits 2 here.

## Review Focus

1. **A deploy consumer still reading the full list.** Any of Cloud Build, `deploy.sh`, `publish-all.sh` (including `--registry-only`), `smoke-test.sh` or Terraform picking up an experimental server would publish or deploy it. Pinned in Task 2 by running `publish-all.sh --dry-run` (and `--registry-only --dry-run`), `deploy.sh` and `smoke-test.sh` against a fixture registry with an experimental server, with `npm`, `pnpm`, `mcp-publisher`, `gcloud`, `docker`, `terraform` and `curl` replaced by logging shims, and asserting the experimental package appears in no logged command; Cloud Build by asserting `.fleet-services` (from `fleet.mjs deployable`) is the only source of service names in its steps; Terraform by `terraform console` on `local.fleet_service_names` with the fixture (skipped without the binary).
2. **An experimental server listed in a deploy site.** Terraform would plan a Cloud Run service. Pinned in Task 2 (fleet-inventory fails both ways).
3. **`governed: false` on a server that ships a write.** Its writes would bypass the manifest and the decision-token path. Pinned in Task 3.
4. **Promotion that leaves a deploy list out, or leaves CI red.** Pinned in Task 6 (fleet-inventory and the full contract-tier check after promotion; a missing SHOULD exception refuses promotion) and by the smoke's journey variant.
5. **A read-only server that gains writes keeps ungoverned wiring.** Pinned in Task 6's journey test and the smoke: after `--add-write-stubs`, `manifestUrl` is wired, `governed` is true, and the shared resolver test passes.
6. **A stable server that loses a write MUST.** Pinned in Task 4: the read-only relaxation keys on `status`, never on the tool list.

---

### Task 1: The `status` field and `fleet.mjs deployable`

**Files:**

- Create: `scripts/lib/server-status.mjs`, `scripts/lib/server-status.test.mjs`
- Modify: `registry.json` (`"status": "stable"` after `"type"` on all 13 entries), `scripts/fleet.mjs`

**Interfaces:**

- Produces: `SERVER_STATUSES = ["experimental", "stable"]`; `isDeployable(server): boolean`; `deployableServers(registry): server[]`; `checkStatuses(registry): string[]` (violations: missing or unknown status).
- `node scripts/fleet.mjs deployable` prints deployable package names, one per line, registry order.

- [ ] **Step 1: Failing tests:** `"every registry server declares a known status"` (`checkStatuses(real) == []`); `"a missing or unknown status fails"` (fixtures); `"deployable excludes experimental servers"`; `"fleet.mjs deployable prints the stable servers"` (spawn `node scripts/fleet.mjs deployable`, equals `deployableServers(real).map(package)`).
- [ ] **Step 2: Run** `./node_modules/.bin/vitest run --config vitest.config.scripts.ts scripts/lib/server-status.test.mjs`. Expect FAIL.
- [ ] **Step 3: Implement**, and add `"status": "stable"` to every entry by text insertion (keep the file's formatting).
- [ ] **Step 4: Run it.** Expect PASS. Also `pnpm check:registry` (server.json unaffected).
- [ ] **Step 5: Commit** `feat: registry status field; fleet.mjs deployable`

### Task 2: Publish and deploy cover stable servers only

**Files:**

- Modify: `scripts/publish-all.sh`, `scripts/deploy.sh`, `scripts/smoke-test.sh`, `cloudbuild.yaml`, `cloudbuild-manual.yaml` (`fleet.mjs servers` → `fleet.mjs deployable`); `terraform/main.tf` (`fleet_service_names` filters `try(s.status, "") == "stable"`); `terraform/variables.tf` descriptions ("every stable server"); `scripts/lib/fleet-inventory.mjs`, `scripts/lib/fleet-inventory.test.mjs`

**Interfaces:**

- `INVENTORY_SITES` entries for the deploy files gain `expected: (servers) => deployableServers({ servers }).map(p)`; `CENSUS` counts only the expected packages for those files.
- `DERIVED` entries for the five deploy consumers require `reads: "fleet.mjs deployable"` (Terraform: `status`).

- [ ] **Step 1: Failing tests** in `fleet-inventory.test.mjs`: with a fake experimental server appended to the registry, (a) the deploy sites must NOT list it (listing it is a violation `lists <pkg>, which is experimental`), (b) the listing sites (issue forms, docs tables) MUST list it; (c) each deploy consumer in `DERIVED` reads `fleet.mjs deployable`. Add `scripts/lib/deploy-filter.test.mjs`: copy `scripts/`, `registry.json` (plus an experimental fixture) into a temp root, put logging shims for `npm`, `pnpm`, `mcp-publisher`, `gcloud`, `docker`, `terraform` and `curl` first on `PATH`, run `publish-all.sh --dry-run`, `publish-all.sh --registry-only --dry-run`, `deploy.sh dev` and `smoke-test.sh dev`, and assert the experimental package is in no logged command while a stable one is. Assert every Cloud Build step that names a service reads `/workspace/.fleet-services`, and that file is written by `fleet.mjs deployable`. If `terraform` is installed, `terraform console` evaluates `local.fleet_service_names` to the stable fixtures. Run; expect FAIL.
- [ ] **Step 2: Implement** the consumers and the inventory change. Every existing server is stable, so the real-registry check stays green.
- [ ] **Step 3: Run** `vitest … scripts/lib/fleet-inventory.test.mjs scripts/lib/cloudbuild-substitutions.test.mjs` and `terraform fmt -check terraform/` (+ `terraform validate` if available). Expect PASS.
- [ ] **Step 4: Commit** `feat: publish and deploy only stable servers`

### Task 3: Ungoverned means no writes

**Files:**

- Modify: `scripts/lib/governed-packages.mjs` (add `checkUngovernedHasNoWrites(server, tools): string[]`), `scripts/lib/governed-packages.test.mjs`

- [ ] **Step 1: Failing tests:** replace `"dbm-mcp is the only ungoverned (reporting-only) server"` with `"every governed: false server ships no write tool"` (`it.each` over ungoverned servers, `toolsOf(pkg)` from `scripts/lib/fleet-snapshot-inject.mjs`), plus fixtures: an ungoverned server with a write fails naming the tool; one with only reads passes; a governed server is ignored.
- [ ] **Step 2: Run**; expect FAIL (function missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `vitest … scripts/lib/governed-packages.test.mjs`. Expect PASS (dbm-mcp has no writes).
- [ ] **Step 5: Commit** `feat: an ungoverned server is one with no write tools`

### Task 4: Experimental servers meet their read requirements

**Files:**

- Modify: `scripts/lib/contract-tiers.mjs`, `scripts/lib/contract-tiers.test.mjs`, `docs/CROSS_SERVER_CONTRACT.md`

**Interfaces:**

- `REQUIREMENTS[req].write: boolean` (true for the seven write requirements above). `checkContractTiers` skips write requirements, MUST and SHOULD, for `status: "experimental"`; an exception for a skipped requirement on an experimental server is not "no longer needed".

- [ ] **Step 1: Failing tests:** an experimental management server shipping only list/get/validate/pacing/search passes with exceptions for the read SHOULDs it lacks; the same server marked stable fails on each write MUST; an experimental server missing `get_entity` still fails; the real registry still passes.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement**; add the experimental rule to `CROSS_SERVER_CONTRACT.md`'s tier section.
- [ ] **Step 4: Run** `vitest … scripts/lib/contract-tiers.test.mjs`. Expect PASS.
- [ ] **Step 5: Commit** `feat: experimental servers are held to their read requirements`

### Task 5: `new:server` generates an experimental read-only server

**Files:**

- Modify: `scripts/scaffold/render.mjs` (+ test), `scripts/scaffold/entries.mjs` (+ test), `scripts/scaffold/sites.mjs` (+ test), `scripts/scaffold/scaffold.mjs` (+ test), `scripts/new-server.mjs`, `scripts/scaffold/expected-todo.mjs` (+ test), template files that name the write tools

**Interfaces:**

- `renderTemplate(dir, vars, { writes })`: lines between `{{#writes}}` and `{{/writes}}` marker lines (the marker lines themselves removed) are kept only when `writes`; `WRITE_ONLY_FILES` (the four stub files, `tools/utils/not-implemented.ts`) are omitted otherwise. `TEMPLATE_TOOLS(key, { writes })`.
- `buildRegistryEntry(opts, registry, tools)` with `opts.writes`: `status: "experimental"`; `governed: opts.writes`; `terminalOperations` only with writes; exceptions computed with the experimental rule.
- `insertIntoSites(readFile, s, { deploy })`: deploy sites only when `deploy` (scaffold passes `false`).
- `expectedTodoFailures(key, { writes })`: `[]` without writes; today's single wire-coverage case with writes.
- CLI: `--with-writes`.

- [ ] **Step 1: Failing tests:** render without writes has none of `TEMPLATE_TOOLS(key, {writes:true})`'s write tools, no `manifestUrl` line in `server.ts`, and no `{{#`; with writes it equals today's output; the plan without writes leaves every deploy site untouched and the fleet-inventory/contract-tiers/platform-keys checks pass on the temp tree; the registry entry is `experimental`, `governed: false`, no terminal operations.
- [ ] **Step 2: Run** `vitest … scripts/scaffold/`. Expect FAIL.
- [ ] **Step 3: Implement**, marking the write-only lines in `server.ts` (workflow map and the `manifestUrl` line), `resources/definitions/index.ts`, `tests/*.test.ts`, `README.md`. Add `--add-write-stubs` (`planAddWrites(root, key)`, pure): the write-only files; the `{{#writes}}` files re-rendered when byte-identical to their read-only render, otherwise listed with the lines to add (exit 0, printed as manual steps); registry `governed: true`, `terminalOperations` for `_delete_entity`, `tools` appended. It refuses when the package is missing, not experimental, or already has a write-only file.
- [ ] **Step 4: Run** it. Expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): new servers start experimental and read-only`

### Task 6: `pnpm promote:server` and the transition journey

**Files:**

- Create: `scripts/promote-server.mjs`, `scripts/scaffold/promote.mjs`, `scripts/scaffold/promote.test.mjs`
- Modify: `package.json` (`"promote:server": "node scripts/promote-server.mjs"`)

**Interfaces:**

- `planPromotion(root, key): { writes: Map }` (pure). Flips `"status": "experimental"` → `"stable"` in the entry's text, inserts the deploy sites with `insertIntoSites(…, { deploy: true, listing: false })`, and first runs `checkContractTiers` on the registry with the candidate entry stable; any violation throws `ScaffoldError` listing them. It also throws when the server is unknown or already stable. It does not touch tool files.

- [ ] **Step 1: Failing tests** (temp trees):
  - **The journey:** `new:server` (read-only) → `--add-write-stubs` → `promote:server`. Afterwards: fleet-inventory, the full `checkContractTiers`, `checkRegistryKeys` and the platform-facts validator pass; `server.ts` wires `manifestUrl`; the entry is `governed: true`, `stable`, with the four write tools in `tools` and `_delete_entity` terminal; the deploy sites list it.
  - Promoting a read-only scaffold throws naming `create_entity`, `update_entity`, `delete_entity`, `bulk_update_status`.
  - Promoting with a write SHOULD exception removed throws naming `duplicate_entity`.
  - Promoting twice throws; nothing is written on any throw.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement** plan, apply (prettier on written json/md), CLI (exit 2 on `ScaffoldError`).
- [ ] **Step 4: Run** it. Expect PASS.
- [ ] **Step 5: Commit** `feat: pnpm promote:server`

### Task 7: The smoke proves both paths

**Files:**

- Modify: `scripts/scaffold/smoke.mjs` (`--variant read-only | journey`), `.github/workflows/ci.yml` (`scaffold-smoke` gets `strategy.matrix.variant`)

Both variants run `pnpm run test` (every package, `@cesteral/shared` included, so the resolver-coverage and testkit suites see the generated registry entry) in place of the new package's tests alone.

- `read-only`: `new:server` default; expected failures `[]`; uncovered writes `[]`; the deploy sites do not list the server.
- `journey`: `new:server`, `--add-write-stubs`, `promote:server`; expected failures = the wire-coverage case; uncovered writes = the four stubs; the deploy sites list the server.

- [ ] **Step 1:** Implement; run `node scripts/scaffold/smoke.mjs --variant read-only` locally once. Expect exit 0, `failed = expected (0)`. The CI matrix runs both.
- [ ] **Step 2: Commit** `ci: scaffold smoke for the read-only path and the promotion journey`

### Task 8: Docs

**Files:**

- Modify: `docs/guides/adding-a-new-server.md` (generate → experimental read-only; `--add-write-stubs` and what stays the contributor's; promote, stating that promotion proves contract completeness while wire coverage gates merge), `CLAUDE.md` (a line on `status` under Deployment), the template `README.md` to-do list (split into "before merge" and "before promotion")

- [ ] **Step 1:** Write; `./node_modules/.bin/prettier --check` the files; check every link and anchor resolves.
- [ ] **Step 2: Commit** `docs: experimental servers and promotion`

---

## After this PR

- **PR 3b:** `reporting` and `reporting_conversions` templates, each a smoke variant.
