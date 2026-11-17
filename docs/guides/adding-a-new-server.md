# Adding a New MCP Server

How to add an ad platform to this repo. The short version: agree the platform key in a proposal, run `pnpm new:server`, and land the server as an **experimental, read-only** server first. Add its write tools later, then `pnpm promote:server` it into publish and deploy. Each stage has a to-do list at the end of the generated package's README. CI's `scaffold-smoke` job generates a server of every type from the same templates on every pull request, so the generated code passes the fleet's checks as they stand today. That is why this guide points at the template instead of reproducing code.

Treat CI as the authority. Almost every rule a server must meet is a check, and each failure names the file to change. Run `pnpm ci:local` early and often: it runs `.github/workflows/ci.yml`'s jobs in order and reports a job it cannot run locally (Terraform, gitleaks) as NOT RUN rather than passed.

## Contents

- [Before you start](#before-you-start)
- [Generate the server](#generate-the-server)
- [Add the write tools and promote](#add-the-write-tools-and-promote)
- [What the template gives you](#what-the-template-gives-you)
- [Implementing the write tools](#implementing-the-write-tools)
- [Adding a tool later](#adding-a-tool-later)
- [What CI checks](#what-ci-checks)
- [What no check covers](#what-no-check-covers)
- [Reference](#reference)

## Before you start

**Tools.** Node 26 and pnpm 10.34.5 (the repo's `packageManager`). Node 26 no longer bundles corepack, so install pnpm with `npm install -g pnpm@10.34.5`, or prefix commands with `npx -y pnpm@10.34.5`. An older pnpm fails the `engines` check, or worse, runs and does nothing.

**Agree three things in a [New Platform Proposal](https://github.com/cesteral/mcp-open-advertising/issues/new?template=new_platform_proposal.yml) first.**

1. **The platform key.** One key names the platform everywhere: the package (`reddit` → `reddit-mcp`), the tool prefix (`reddit_list_entities`), the registry's `tool_prefix` and `platform_key`, every governed tool's `cesteral.platform` and `contractPlatformSlug` (so every `contractId` starts with it), the telemetry platform, the rate-limit and span keys, and the `platform-facts.json` id prefix. Use lower snake case (`amazon_dsp`, not `amazon-dsp`) and the platform's common short name (`reddit`, not `reddit_ads`). It cannot be renamed later without re-admitting every governed tool, because the governance layer keys write admission on it. The rule and the frozen exceptions of older servers are in [the platform-key decision](../plans/2026-10-11-platform-keys-and-contract-decisions.md) and `scripts/lib/platform-keys.mjs`.
2. **The server type.** `management`, `reporting` or `reporting_conversions` (registry `type`). The type decides the tools the server MUST ship and the ones it SHOULD ship (`scripts/lib/contract-tiers.mjs`; [CROSS_SERVER_CONTRACT.md](../CROSS_SERVER_CONTRACT.md)). The scaffold generates all three ([what each gets](#what-the-template-gives-you)).
3. **The auth model.** Which credentials a request carries and how the adapter validates them. [Reference](#auth-patterns) lists what the fleet uses.

**Hosted governance must add the platform.** Cesteral's hosted governance layer admits a governed write only for a platform key it knows. Until it adds yours, it refuses your server's governed writes, however correct the annotations are. Self-hosted servers are unaffected (their decision-token mode defaults to `off`). Ask for this in the proposal so the work runs in parallel with yours.

## Generate the server

```bash
pnpm new:server reddit --display-name "Reddit Ads" --base-url https://ads-api.reddit.com/api/v3 --docs-url https://ads-api.reddit.com/docs
```

`--type` picks the server type: `management` (the default), `reporting` or `reporting_conversions`. Add `--dry-run` to list the files first. `--port` defaults to one past the highest port in `registry.json`, and `--rate-limit` to 25 requests per minute. The command writes nothing until every check passes: a taken key, prefix or port, an invalid port, or an existing package exits 2 and names the owner.

It writes `packages/reddit-mcp` from the layers in [`templates/server/`](../../templates/server/) (`base`, then `entities` and `reports` where the type needs them, then the type's own layer; a layer's `+writes/` files render only with writes) as an **experimental, read-only** server: registry `status: "experimental"` and `governed: false`. CI builds, tests and conformance-runs it like any other server, but it is never published or deployed: publish, Cloud Build, `deploy.sh`, `smoke-test.sh` and Terraform cover stable servers only (`node scripts/fleet.mjs deployable`). It adds the server to:

- `registry.json`, and the registry data `@cesteral/shared` compiles in (serverInfo and the server card read it)
- `packages/reddit-mcp/server.json`
- `platform-facts.json` (the API base and the rate-limit default, `unverified`, due in 180 days) and the fact counts in its doc
- the README fleet table
- the hand-maintained lists `scripts/lib/fleet-inventory.mjs` checks that are not about deploying: the issue-form dropdowns, `CROSS_SERVER_CONTRACT.md` and `platform-mapping.md`, and the two reporting platform enums in `@cesteral/shared` (`ReportingPlatform` and the report-schedule `platform`), for every type, since every type ships `get_report` and `scripts/lib/platform-keys.mjs` requires the enums to name every reporting-capable server. The deploy lists (Cloud Build's `images:`, the three Terraform maps, the tfvars examples) wait for promotion.

Then build, record the new tools' untrusted-content declarations and every tool's `definitionHash` (both are read from the built servers), and test. The hash sync also records the existing tools whose schema enumerates the fleet's platforms (the report-schedule tools), which gain the new key:

```bash
pnpm install && pnpm run build
pnpm sync:untrusted-declarations
pnpm sync:tool-definition-hashes
pnpm run test
```

At this point CI passes in full. If something fails, the template has drifted from the fleet, and `scaffold-smoke` on `main` would be red too. The generated `packages/reddit-mcp/README.md` ends with **Before this server can merge** (the read stage) and **Before it can be promoted**.

`--with-writes` generates the governed write stubs from the start instead; the server is still experimental, and CI then fails only `wire-request-coverage` for the type's stubs until each has a wire test.

## Add the write tools and promote

Write tools are required only at promotion, and only where the type requires them: while a server is experimental, `contract-tiers` holds it to its type's read requirements, and `governed: false` is allowed because it ships no write tool (`scripts/lib/governed-packages.test.mjs`).

1. **Start the writes:** `pnpm new:server reddit --add-write-stubs`. It adds the type's governed stubs (below), wires `manifestUrl`, and sets `governed: true`, any terminal operations and the registry `tools`. It re-renders only the template files you have not changed since the scaffold; for the others it prints the lines to add.
2. **Implement them** ([next sections](#implementing-the-write-tools)), each with its wire test, and run `pnpm sync:untrusted-declarations`. That part is yours: the command never edits tool code you wrote.
3. **Promote:** `pnpm promote:server reddit` flips `status` to `stable` and adds the server to the deploy lists. It refuses, writing nothing, unless the server meets its type's whole contract: every MUST, and an exception for every SHOULD it lacks (the scaffold records those from the start). Promotion proves the contract is complete, not that the writes work: `wire-request-coverage` still blocks the merge until each write has a wire test.
4. **Before it deploys,** add the platform's credential secrets to its `mcp_secret_env_vars` entry ([below](#what-no-check-covers)).

| Type                    | `--add-write-stubs` adds                                                                             | Promotion needs                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `management`            | `create_entity`, `update_entity`, `delete_entity` (terminal), `bulk_update_status`                   | all four                                           |
| `reporting`             | `submit_report`, plus the reads `check_report_status` and `download_report`                          | nothing: `get_report` meets the reporting MUST     |
| `reporting_conversions` | `submit_report` and `insert_conversions`, plus the reads `check_report_status` and `download_report` | `insert_conversions` (conversion upload is a MUST) |

## What the template gives you

Every type gets `list_accounts`, `get_report` (synchronous rows), `get_pacing_status` and `search_tools`, against placeholder endpoints. The rest depends on the type:

| Type                    | Read-only scaffold adds                          | With writes (`--with-writes` or `--add-write-stubs`)                                              |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `management`            | `list_entities`, `get_entity`, `validate_entity` | governed `create_entity`, `update_entity`, `delete_entity`, `bulk_update_status`                  |
| `reporting`             | nothing more                                     | the async report trio: governed `submit_report`, then `check_report_status` and `download_report` |
| `reporting_conversions` | `list_entities`, `get_entity`, `validate_entity` | the async report trio, and governed `insert_conversions` (sa360-mcp's shape)                      |

A **governed stub** has a complete schema and governance annotation, and every call, including `dry_run`, returns an error until you implement it. `check_report_status` and `download_report` are working reads against placeholder paths: `download_report` fetches the URL the status response names through `fetchGuardedDownload`, which refuses any host outside the service's `downloadHosts` (the API host to start with), on every redirect hop too.

The files are the reference; read them before changing them. What each one leaves to you:

| File                                                                                         | What to change                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/index.ts`                                                                        | Env vars your credentials need. The base-URL and rate-limit lines are platform facts: `platform-facts.json` points at their line numbers, so moving them fails `check:platform-facts` until you update `codeRefs`.                                                               |
| `src/auth/<key>-auth-adapter.ts`                                                             | `validate()` must call a cheap authenticated endpoint (Meta's `/me`, Pinterest's `/v5/user_account`) and check the token may use the account header. Return the platform's user id from `<key>QuotaUser`. For refresh tokens, extend `OAuth2RefreshAdapterBase` (pinterest-mcp). |
| `src/auth/<key>-auth-strategy.ts`                                                            | The refresh-token branch, if the platform has one.                                                                                                                                                                                                                               |
| `src/services/<key>/<key>-http-client.ts`                                                    | Headers, error hints, pagination. The retry config is published on the server card, so keep it the policy callers meet.                                                                                                                                                          |
| `src/services/<key>/<key>-service.ts`                                                        | The account and `get_report` endpoints and response shapes.                                                                                                                                                                                                                      |
| `src/services/<key>/<key>-reporting-service.ts` (async reports)                              | The status path and its mapping. Add the platform's report file host to `downloadHosts` when it is not the API host (a CDN or storage bucket). Name the exact host, never a shared suffix such as `amazonaws.com`.                                                               |
| `src/mcp-server/tools/utils/entity-mapping.ts`, `src/services/<key>/<key>-entity-service.ts` | The real entity types, endpoints and response shapes. Map each type to a canonical governance kind (`campaign`, `ad_group`, `ad`); a type with none is listable, but its governed writes resolve to `canonicalEntityKind: null`.                                                 |
| `src/services/session-services.ts`, `session-wiring.ts`                                      | Services you add (a reporting service, say). Keep `boundAccountId`: account-scoped tools check the caller's account against it.                                                                                                                                                  |
| `src/mcp-server/tools/definitions/*.tool.ts`                                                 | Implement the stubs ([next section](#implementing-the-write-tools)); add tools ([after that](#adding-a-tool-later)).                                                                                                                                                             |
| `src/mcp-server/server.ts`                                                                   | Only data: description, instructions, the workflow-id map. The shared `createPlatformMcpServer()` owns registration and its order. Keep the `platform: "<key>"` and `manifestUrl: new URL(...)` lines literal; fleet checks read them as source.                                 |
| `src/mcp-server/resources/`, `src/mcp-server/prompts/`                                       | Entity schemas and examples, workflow prompts (pinterest-mcp has both). Their text may name only registered tools. The two cross-platform prompts come from `@cesteral/shared`; never copy them.                                                                                 |
| `tests/`                                                                                     | The fleet's shared suites are one call each (schema size, cross-server contract, server card); change a fleet-wide check in `@cesteral/shared/testkit`, never in a copy. Add wire tests here.                                                                                    |
| `README.md`, `CLAUDE.md`                                                                     | The to-do list, then the platform quirks a later contributor would trip on. Add the package to the "Server-Specific Notes" table in the root `CLAUDE.md`.                                                                                                                        |

Rate-limit keys must start with `<key>:` and must be scoped to the credential's quota user, never to a caller-named account alone or a fixed key: a bucket keyed only on the account is shared across tenants, so one tenant can drain another's quota (#237; `packages/pinterest-mcp/src/services/pinterest/rate-limit-keys.ts`).

## Implementing the write tools

The `cesteral` block inside a tool's `annotations` is what makes it **governed**. It wires the tool into the attestation manifest, the `definitionHash` contract and the decision-token path. The governance layer mints a short-lived signed decision token after a write clears admission, bound to the tool's `contractId`, `definitionHash` and `actionHash`, and the server verifies it before running the write ([decision-token runbook](../governance/decision-token-rollout-and-rotation.md)). The stubs already carry correct blocks. What implementing them involves:

**Entity or effect.** An **entity write** mutates a canonical entity: it declares a `readPartner` (the read tool that returns the before and after state, here `<key>_get_entity`, which carries a `kind: "read"` block) and promises `requiresValidation`, `requiresSimulation` and `supportsBeforeAfterSnapshot`. An **effect write** has no canonical snapshot (an upload, a report schedule, a conversion upload, a bulk batch): no `readPartner`, `supportsBeforeAfterSnapshot: false`, and honest `requiresValidation` / `requiresSimulation` booleans. Of the stubs, `create_entity`, `update_entity` and `delete_entity` are entity writes; `bulk_update_status` (`operation: ["bulk_job"]`), `submit_report` (`["submit_report"]`) and `insert_conversions` (`["upload_conversions"]`) are effect writes. Author annotations with `satisfies CesteralWriteToolAnnotations`; the type is in `@cesteral/contract-schema`.

**Rules that are easy to get wrong:**

- `contractId` equals `` `${contractPlatformSlug}.${contractToolSlug}.v${schemaVersion}` ``, slugs in `/^[a-z0-9_]{1,40}$/`. Bump `schemaVersion` (and the suffix) on a breaking change to the governed surface.
- `entityKinds` are canonical kinds, not the platform's type names.
- `readPartner.argMap` maps this tool's argument names to the read tool's, and must cover every argument the read tool requires, `entityType` and the account included (`readpartner-argmap`).
- `executableArgsExclude` lists control arguments that are not part of the write (`dry_run`); the token's `actionHash` covers the rest.
- A dry run must validate and simulate, or fail. A governed write never returns `validationSource: "none"` or `expectedStateSource: "none"`; call `assertGovernedDryRunResult` (or `assertGovernedEffectDryRun`) on every dry-run result. pinterest-mcp's `tools/utils/dry-run.ts` is a symbolic dry run for a platform with no native one.
- Delete and bulk-status tools confirm with the user through elicitation (`elicitBulkStatusChangeConfirmation` and the fleet's delete tools), sent with the request's id so it reaches the client ([http-transport-security.md](../architecture/http-transport-security.md)).
- **Wire tests.** Each write tool needs a `tests/**/*wire*.test.ts` that calls its `*Logic` with only `globalThis.fetch` stubbed and asserts the exact upstream method, URL and body, citing the vendor source in a `// basis:` comment (an API reference page, an OpenAPI document and its version). A mocked unit test cannot catch a wrong path or body. Reference: `packages/pinterest-mcp/tests/tools/pinterest-wire-requests.test.ts` and `tests/helpers/wire.ts`.
- **Terminal operations.** A tool that deletes, or offers a status the platform cannot undo (`ARCHIVED`, `DELETED`), goes in the registry entry's `operational.terminalOperations` with a note saying what cannot be reversed. If it is in fact reversible, list it in `scripts/lib/reversible-operations-allowlist.json` with the reason. A management scaffold declares `delete_entity` terminal; check the note against the platform.
- **Untrusted content.** Declare the output paths that carry platform text (`untrustedContent`), then run `pnpm sync:untrusted-declarations` ([untrusted-content-marking.md](../architecture/untrusted-content-marking.md)).

`registerToolsFromDefinitions()` does the rest once the annotation is right: decision-token verification (mode `off` outside a hosted deployment, `warn` when `K_SERVICE` is set), the dry-run promise checks, and the `definitionHash` (from `@cesteral/contract-hash`; you never compute it). `pnpm run generate:manifests` must print `wrote manifest with N governed tool(s)` for the package.

## Adding a tool later

1. One file in `src/mcp-server/tools/definitions/`: a `z.object` input schema (never a top-level union: the SDK publishes it as empty), the metadata, and a `*Logic` handler. Register it in `definitions/index.ts`.
2. Add it to the workflow-id map in `server.ts`, and to a group in the server-capabilities resource.
3. Declare `untrustedContent`, or `NO_UNTRUSTED_CONTENT` when the tool returns no platform text.
4. Account-scoped tools call `assertAccountScope()` with the session's bound account.
5. A write tool also needs a `cesteral` block, a wire test, and a terminal-operation entry if it is destructive.
6. Run `pnpm sync:registry-tools`, `pnpm sync:untrusted-declarations` and `pnpm sync:tool-definition-hashes`, and update the tool count in the README fleet table.
7. If the tool's name, title or description competes with another server's tools, the routing and tool-search evals may move ([evals.md](../architecture/evals.md)).

## What CI checks

The gate is `pnpm ci:local` (one job: `--job <name>`; the plan: `--list`). Conformance binds ports 3001 upward, so stop local dev servers first. A read-only scaffold satisfies every row; one with write stubs fails only their wire-request coverage. The table is what you must keep true as you change the package.

| Requirement                                                                                            | Enforced by                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A registry entry with every field, listed in every hand-maintained fleet list                          | `fleet-inventory`, `server-info`                                   |
| Registry `tools` / `prompts` match the source and the live server; `server.json` generated             | `check:registry-tools`, `check:registry-runtime`, `check:registry` |
| One platform key across registry, tool prefix and governed annotations                                 | `platform-keys`                                                    |
| The MUST tools for the registry `type`; each missing SHOULD has a reasoned `contract.exceptions` entry | `contract-tiers`                                                   |
| Every write tool governed; `contractId` built from its slugs; manifest generated                       | `write-coverage`, `contract-id-invariant`, `generate:manifests`    |
| Each entity write's `readPartner.argMap` covers the read tool's required arguments                     | `readpartner-argmap`                                               |
| Every write tool has a basis-cited wire test                                                           | `wire-request-coverage`                                            |
| Destructive tools and irreversible statuses are declared terminal or allowlisted                       | `terminal-operations`                                              |
| Every tool declares `untrustedContent`, and the snapshot matches                                       | `untrusted-declarations`, `untrusted-error-marker`                 |
| `inputSchema` is a `z.object`; `readOnlyHint` explicit and consistent with the HTTP verbs used         | `input-schema-wire`, `write-coverage`, `write-behavior`            |
| The workflow-id map covers every tool except `_search_tools`                                           | `workflow-id-maps`                                                 |
| The shared cross-platform prompts; prompt and resource text names only registered tools                | `cross-platform-prompts`, `prompt-tool-references`                 |
| Account-scoped tools call `assertAccountScope()`                                                       | `check:account-scope`                                              |
| Rate-limit keys start with `<key>:`                                                                    | `rate-limit-keys`                                                  |
| `manifestUrl` passed in `server.ts`                                                                    | `definition-hash-resolver-coverage` (shared)                       |
| Platform facts for the base URL and rate-limit default, pinned to the config lines                     | `check:platform-facts`                                             |
| README fleet row with the live tool count                                                              | `check:doc-tool-counts`                                            |
| `status` is `experimental` or `stable`; deploy lists and deploy scripts cover stable servers only      | `server-status`, `fleet-inventory`, `deploy-filter`                |
| `governed: false` only while the server ships no write tool                                            | `governed-packages`                                                |
| The template itself still generates a server that passes all of the above                              | `scaffold-smoke`                                                   |

The checks live in `scripts/lib/*.test.mjs`, `scripts/__tests__/`, `evals/` and `packages/shared/tests/`. The root scripts suite boots every server once and hands the result to every file (`scripts/lib/fleet-snapshot-inject.mjs`); a new check should read that rather than boot servers itself.

## What no check covers

Before the server merges:

- [ ] `validate()` calls a real platform endpoint and memoizes the result, so a bad token fails at session start
- [ ] `./scripts/dev-server.sh <key>-mcp` starts; `curl http://localhost:<port>/health` returns 200, and a `ping` to `/mcp` answers
- [ ] The platform facts are verified against the vendor's pages, or knowingly left `unverified` with their deadline
- [ ] `docs/guides/ENV-VARIABLES-GUIDE.md`, `.env.example` and `scripts/create-secrets.sh` list the server's env vars

After it is promoted and before it deploys, because the checks prove the server is _listed_, not that it will _run_ on Cloud Run:

- [ ] Its `mcp_secret_env_vars` entry in `terraform/variables.tf` maps every credential env var to a Secret Manager secret. `promote:server` creates the entry with only `MCP_AUTH_SECRET_KEY` (and refuses if a deploy list names the server already, so do not add it earlier): a reference to a secret that does not exist fails the deploy, so add the rest when the secrets exist.
- [ ] Those secrets are created (`scripts/create-secrets.sh`) and hold values
- [ ] Per-environment settings in your tfvars (resources, auth-mode overrides, invokers)
- [ ] A `terraform plan` against the real project shows the new module resolving

## Reference

### Auth patterns

Read from each package's `src/config/index.ts` and `src/auth/`. Every server also accepts `jwt` and `none`.

| Server                        | Platform auth mode  | Adapters                                                       | Request headers                                                                                  |
| ----------------------------- | ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| dv360-mcp, dbm-mcp, cm360-mcp | `google-headers`    | `GoogleAuthAdapter` (shared)                                   | Google OAuth2 credentials, read by the shared strategy                                           |
| gads-mcp                      | `gads-headers`      | `GAdsRefreshTokenAuthAdapter`                                  | `X-GAds-Client-Id`, `-Client-Secret`, `-Refresh-Token`, `-Developer-Token`, `-Login-Customer-Id` |
| sa360-mcp                     | `sa360-headers`     | `SA360RefreshTokenAuthAdapter`                                 | `X-SA360-Client-Id`, `-Client-Secret`, `-Refresh-Token`, `-Login-Customer-Id`                    |
| ttd-mcp                       | `ttd-token`         | `TtdDirectTokenAuthAdapter`                                    | `TTD-Auth`                                                                                       |
| meta-mcp                      | `meta-bearer`       | `MetaAccessTokenAdapter` / `MetaRefreshTokenAdapter`           | `Authorization: Bearer`; app id and secret for refresh                                           |
| linkedin-mcp                  | `linkedin-bearer`   | `LinkedInAccessTokenAdapter` / `LinkedInRefreshTokenAdapter`   | `Authorization: Bearer`; client id, secret and refresh token                                     |
| tiktok-mcp                    | `tiktok-bearer`     | `TikTokAccessTokenAdapter` / `TikTokRefreshTokenAdapter`       | `Authorization: Bearer`, `X-TikTok-Advertiser-Id`                                                |
| pinterest-mcp                 | `pinterest-bearer`  | `PinterestAccessTokenAdapter` / `PinterestRefreshTokenAdapter` | `Authorization: Bearer`, `X-Pinterest-Advertiser-Id`                                             |
| snapchat-mcp                  | `snapchat-bearer`   | `SnapchatAccessTokenAdapter` / `SnapchatRefreshTokenAdapter`   | `Authorization: Bearer`, `X-Snapchat-Advertiser-Id`                                              |
| amazon-dsp-mcp                | `amazon-dsp-bearer` | `AmazonDspAccessTokenAdapter` / `AmazonDspRefreshTokenAdapter` | `Authorization: Bearer`, `Amazon-Advertising-API-ClientId`, `Amazon-Advertising-API-Scope`       |
| msads-mcp                     | `msads-bearer`      | `MsAdsAccessTokenAdapter`                                      | `Authorization: Bearer`, `X-MsAds-Developer-Token`, `X-MsAds-Customer-Id`, `X-MsAds-Account-Id`  |

A Google platform uses `GoogleAuthAdapter` from `@cesteral/shared`. A bearer-token platform extends `BearerAuthStrategyBase`, as the template does; its refresh-token branch takes app credentials from headers (pinterest-mcp). A scheme with no bearer token implements the `AuthStrategy` interface directly, as ttd-mcp and gads-mcp do. Platform auth adapters live in the server package, never in `@cesteral/shared`.

### The governance chain

`cesteral` annotation on a write tool → `definitionHash` (`@cesteral/contract-hash`) → `dist/cesteral-manifest.json` (`pnpm run generate:manifests`) → signed by npm build provenance on release → verified by the governance repo, which promotes the tool to `attested` trust → a decision token bound to `contractId`, `definitionHash` and `actionHash`, verified at call time. Two strictness settings are easy to conflate: `GOVERNANCE_TOKEN_MODE` (`off` / `warn` / `enforce`) is set per deployment, while per-tenant strictness is the governance layer's per-organisation policy, not a server setting. Details: [release-attestation.md](../architecture/release-attestation.md), [governance-runtime.md](../architecture/governance-runtime.md), [`docs/governance/`](../governance/).

### Further reading

- [CROSS_SERVER_CONTRACT.md](../CROSS_SERVER_CONTRACT.md): required tools per type, the bulk result format
- [platform-facts-ledger.md](../architecture/platform-facts-ledger.md): recording a platform claim
- [server-card-operational-envelope.md](../architecture/server-card-operational-envelope.md): what the server card publishes
- `packages/pinterest-mcp`: a complete management server, with reporting, uploads, refresh tokens and a symbolic dry run
