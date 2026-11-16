# Reporting Templates (PR 3b of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm new:server --type reporting` and `--type reporting_conversions` generate experimental read-only servers whose CI is fully green, with the same write-stub and promotion path management servers have.

**Architecture:** The template becomes layers: `templates/server/base/` (every type), `templates/server/entities/` (types that manage entities) and one directory per type. A type renders its layers in order; a later layer's file replaces an earlier one at the same path. Every type gets a synchronous `get_report` read, which meets the `reporting` requirement while read-only. With writes, reporting types gain the fleet's async trio (a governed effect `submit_report` stub, `check_report_status`, `download_report` on the shared report-view and `report-csv://` helpers), and `reporting_conversions` a governed effect `insert_conversions` stub (sa360's shape). The smoke grows to five legs.

**Tech Stack:** ESM `.mjs` scripts, vitest, the existing `{{#writes}}` renderer.

**Spec:** the decisions of 2026-11-16 (shared base + type overlays; async trio for reports; `insert_conversions` via `--add-write-stubs`; five smoke legs; then, because every fleet `submit_report` is a governed write, `get_report` in the read-only stage and the trio with writes), on top of `docs/plans/2026-11-16-experimental-servers.md`.

## Global Constraints

- Layers per type: `management` = base + entities + management; `reporting` = base + reporting; `reporting_conversions` = base + entities + reporting_conversions. A later layer's file replaces an earlier layer's file at the same path; no other merging.
- Refactoring the management template into layers changes no rendered byte (checked before `get_report` is added).
- Read tools in base: `list_accounts`, `get_report`, `get_pacing_status`, `search_tools`. Entities layer: `list_entities`, `get_entity`, `validate_entity`.
- Write stubs (governed, every call errors until implemented):
  - `management`: unchanged, `create_entity`, `update_entity`, `delete_entity`, `bulk_update_status`.
  - `reporting`: `submit_report` (`writeClass: "effect"`, `operation: ["submit_report"]`), plus the reads `check_report_status` and `download_report`, which only make sense with it.
  - `reporting_conversions`: those three plus `insert_conversions` (`writeClass: "effect"`, `operation: ["upload_conversions"]`).
- `--add-write-stubs` works for every type. `promote:server` is unchanged: a `reporting` server can promote read-only, while `reporting_conversions` needs `insert_conversions` first (its `conversion_upload` MUST).
- No terminal operations for the reporting types (nothing destructive); `get_entity`'s `cesteral` read block stays in a writes section (entity types only).
- Smoke legs: `management` read-only and journey, `reporting` read-only, `reporting_conversions` read-only and journey.

## Review Focus

1. **Layer drift.** A fix to a base file reaches every type, while a type file shadows its base copy. A shadowed file that should have stayed shared goes stale. Pinned in Task 1 by a test: no type layer may shadow a base file unless it is on an explicit `SHADOWED` list.
2. **A reporting server that is governed while read-only.** `get_report` and the base reads carry no `cesteral` block, and `submit_report` exists only with writes. Pinned in Task 3 by the rendered tool-registration test and the smoke's `governed-packages` pass.
3. **`download_report`'s URL safety.** The template must use `assertSafeDownloadUrl` and the shared report view, and must never fetch a caller-supplied URL. Pinned in Task 4 by a template test that a non-https or off-host URL is refused.
4. **The `{}` sweep.** Every type keeps a tool that accepts `{}` (`list_accounts`), so `untrusted-error-marker` reaches the factory. This is held by base; the smoke legs check it.
5. **Write-stub accounting per type.** `expectedTodoTools`, `WRITE_TOOLS`, the README tool count and `registry.json` `tools` must all agree for each type. Pinned in Tasks 3 to 5 by the `--add-write-stubs` byte-identical test for each type.

---

### Task 1: Layered templates, management unchanged

**Files:**

- Move: `templates/server/management/**` into `templates/server/base/` (shared files), `templates/server/entities/` (entity-mapping, the entity service, list/get/validate tools) and `templates/server/management/` (the barrel, `server.ts`, `session-services.ts`, `resources/definitions/index.ts`, the four stubs, `README.md`, `CLAUDE.md`, the three suite tests and `tool-registration.test.ts`).
- Modify: `scripts/scaffold/render.mjs` (+ test)

**Interfaces:**

- `TEMPLATE_TYPES: Record<type, { layers: string[]; tools: string[]; writeTools: string[]; writeOnlyFiles: string[] }>`
- `renderTemplate(TEMPLATE_DIR, type, vars, { writes })` replaces `renderTemplate(dir, vars, …)`.
- `TEMPLATE_TOOLS(key, { type, writes })` and `WRITE_TOOLS(key, type)`.
- `SHADOWED`: the base paths a type layer may replace (each with a reason).

- [ ] **Step 1: Before moving anything**, save every rendered file of the management template, for `foo_bar` with and without writes, under the workspace (`render-before/`).
- [ ] **Step 2: Failing tests:** `renderTemplate(…, "management", …)` with and without writes equals `render-before/` byte for byte; a type layer shadowing a base path that is not on `SHADOWED` fails; an unknown type throws. Run; expect FAIL.
- [ ] **Step 3: Move the files and implement.** Update `planScaffold` and `planAddWrites` to the new signature.
- [ ] **Step 4: Run** `vitest … scripts/scaffold/`. Expect PASS, including the existing `--add-write-stubs` byte-identical test.
- [ ] **Step 5: Commit** `refactor(scaffold): layered server templates (base, entities, per type)`

### Task 2: `get_report` for every type

**Files:**

- Create: `templates/server/base/src/mcp-server/tools/definitions/get-report.tool.ts`, `templates/server/base/src/services/{{key}}/{{key}}-reporting-service.ts`
- Modify: the management layer's barrel, `server.ts`, resources and tests

**Requirements:**

- `get_report` input: `accountId`, `startDate`, `endDate` (YYYY-MM-DD), optional `dimensions`, `metrics` and `pageToken`.
- `get_report` output: `{ rows, pagination, timestamp }`, with `untrustedContent` `{ structuredPaths: ["$.rows"], contentBlocks: [0] }`.
- `get_report` is read-only with no `cesteral` block, calls `assertAccountScope`, and uses rate-limit key `{{key}}:user:${quotaUser}:account:${accountId}`.
- The reporting service calls a placeholder `GET /accounts/{id}/reports`, behind a `TODO(scaffold)`.

- [ ] **Step 1: Failing tests:** the rendered management tools include `foo_bar_get_report`, and `buildRegistryEntry` no longer records a `reporting` exception. Run; expect FAIL.
- [ ] **Step 2: Implement.** Render both management variants into a temp package; expect tsc and eslint clean and the package's tests passing.
- [ ] **Step 3: Commit** `feat(scaffold): get_report in every template`

### Task 3: The `reporting` type

**Files:**

- Create: `templates/server/reporting/**`:
  - the barrel, `server.ts` (passing `reportCsv` with writes), `session-services.ts` (the reporting service, plus `createSessionBoundReportCsvStore` with writes), resources, `README.md`, `CLAUDE.md`, the suite tests and `tool-registration.test.ts`;
  - with writes, the governed `submit-report.tool.ts` stub and the `check-report-status.tool.ts` / `download-report.tool.ts` reads.
- Modify: `scripts/scaffold/scaffold.mjs` (drop the "not supported" refusal for `reporting`), `entries.mjs` (type-specific description, no terminal operations), `add-writes.mjs` (per-type write files and tools), `expected-todo.mjs` (per type), tests

- [ ] **Step 1: Failing tests:**
  - `planScaffold` with `type: "reporting"` passes fleet-inventory and contract-tiers, and its entry is `experimental`, `governed: false`.
  - The render has no `cesteral` block and no `manifestUrl`.
  - `--add-write-stubs` on an untouched reporting scaffold equals a `--with-writes` reporting scaffold.
  - Promoting a read-only reporting scaffold succeeds.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.** `check_report_status` uses `ReportStatusSchema`. `download_report` takes only a `reportId` and an optional view, and fetches the platform URL the status call returned, through `assertSafeDownloadUrl`, `createServiceDownloadedReportView` and `spillBodyToGcs`. Render both variants into a temp package; expect tsc, eslint and its tests clean.
- [ ] **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): reporting server template`

### Task 4: The `reporting_conversions` type

**Files:**

- Create: `templates/server/reporting_conversions/**`:
  - the type's files, as for reporting, plus the entity tools from the entities layer;
  - with writes, the trio from Task 3 and the governed `insert-conversions.tool.ts` stub.
- Modify: `scaffold.mjs` (drop the last refusal), `add-writes.mjs`, `expected-todo.mjs`, tests

- [ ] **Step 1: Failing tests:**
  - The read-only scaffold passes fleet-inventory and contract-tiers.
  - Promoting it read-only throws, naming `foo_bar_insert_conversions`.
  - After `--add-write-stubs` it promotes, and every check passes.
  - Add a template test: `download_report` refuses a non-https or off-host URL.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement.** Render both variants; tsc, eslint and tests clean.
- [ ] **Step 4: Run**; expect PASS.
- [ ] **Step 5: Commit** `feat(scaffold): reporting_conversions server template`

### Task 5: Five smoke legs

**Files:**

- Modify: `scripts/scaffold/smoke.mjs` (`--type`; the key becomes `zzscaffold` for every type, one per leg), `.github/workflows/ci.yml` (`matrix.include` with the five `{ type, variant }` legs), `scripts/ci-local.mjs` (+ test: `matrix.include`)

- [ ] **Step 1: Failing tests:** `expandMatrix` expands `matrix.include` into one job per entry, with `${{ matrix.type }}` and `${{ matrix.variant }}` substituted; the real ci.yml yields five scaffold-smoke runs. Run; expect FAIL.
- [ ] **Step 2: Implement**, including `--variant journey` for the reporting types (`--add-write-stubs`, then `promote:server`).
- [ ] **Step 3: Run** `vitest … scripts/__tests__/ci-local.test.mjs scripts/lib/workflow-hardening.test.mjs`. Expect PASS. The CI matrix runs the legs.
- [ ] **Step 4: Commit** `ci: scaffold smoke for every server type`

### Task 6: Docs

**Files:**

- Modify: `docs/guides/adding-a-new-server.md` (the three types, what each generates, the per-type write stubs), `docs/CROSS_SERVER_CONTRACT.md` (scaffold note), `CONTRIBUTING.md` if it names the type limit

- [ ] **Step 1:** Write. Run `prettier --check` on the files; check every link and anchor resolves.
- [ ] **Step 2: Commit** `docs: reporting server templates`
