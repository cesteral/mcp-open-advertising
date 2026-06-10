# Publishing & Deployment Targets

Cesteral MCP servers ship to **three independent registries**, each with a distinct purpose. This guide is the single overview — see the deeper guides linked below for each target.

| Registry                                   | What we ship                            | Audience                               | Required for       | Deeper guide                                                 |
| ------------------------------------------ | --------------------------------------- | -------------------------------------- | ------------------ | ------------------------------------------------------------ |
| **GCP Artifact Registry** (`europe-west2`) | Docker images (one per server)          | Cloud Run (us) and self-hosters on GCP | Hosted deployments | [`deployment-instructions.md`](./deployment-instructions.md) |
| **npm** (`@cesteral/*`)                    | TypeScript packages (stdio entry point) | Local installs (Claude Desktop, CI)    | MCP Registry       | This doc                                                     |
| **MCP Registry** (`io.github.cesteral/*`)  | Server manifests (`server.json`)        | LLM clients discovering servers        | Public discovery   | [`mcp-registry-publishing.md`](./mcp-registry-publishing.md) |

The three are **independent** — you can ship to any one without the others. In practice the release order is:

```
build → npm publish → MCP Registry publish     ← discoverable stdio install
            │
            └──→ docker build → Artifact Registry push → Cloud Run deploy  ← hosted HTTP transport
```

## When to publish to which

| Change                                               | Artifact Registry | npm | MCP Registry                       |
| ---------------------------------------------------- | ----------------- | --- | ---------------------------------- |
| Code change to a server's tools                      | ✓                 | ✓   | (only if metadata changed)         |
| New tool added / renamed                             | ✓                 | ✓   | ✓ (regenerate `server.json` first) |
| Auth-mode change, new transport, new prompt/resource | ✓                 | ✓   | ✓                                  |
| Infra-only change (Terraform, secrets)               | —                 | —   | —                                  |
| README / docs / non-shipping files                   | —                 | —   | —                                  |

`package.json` `files` arrays already exclude tests and config from the published tarball — you don't need to gate every doc tweak.

## Target 1: GCP Artifact Registry (Docker images)

**Repo:** `europe-west2-docker.pkg.dev/{PROJECT_ID}/cesteral`
**Provisioned by:** initial creation in `./scripts/init-gcp-project.sh <dev|prod>` (idempotent); steady-state managed by `google_artifact_registry_repository.container_repo` in `terraform/main.tf` (cleanup policies, labels).
**Image tags:**

- `deploy.sh` (and Cloud Build): `{server}:{git-sha}` + `{server}:latest`. Cloud Run revisions pin to the SHA; `:latest` is for humans inspecting recent builds.
- `cloudbuild-manual.yaml`: `{server}:{env}-latest` (env-scoped rolling tag). Used only for the standalone image-build flow.

### Routine publish

The Docker publish is part of the deploy flow — there's no standalone "publish to Artifact Registry" command in normal use:

```bash
./scripts/deploy.sh <dev|prod>            # builds + pushes + deploys
./scripts/deploy.sh <dev|prod> --plan-only # builds + pushes, but only Terraform-plans
```

Cloud Build runs the same flow on push via `cloudbuild.yaml`.

### Manual image build (without Terraform)

For iterating on the Dockerfile itself without touching infra:

```bash
gcloud builds submit --config=cloudbuild-manual.yaml --substitutions=_ENVIRONMENT=dev
```

### Retention

Cleanup is enforced by two policies on the AR repo (declared in `terraform/main.tf`): **keep** the 10 most-recent tagged versions per image, and **delete** stale untagged versions. Adjust `keep_count` in Terraform if a release cadence change demands more history.

### IAM

The `terraform-deployer` SA has `roles/artifactregistry.admin` (granted by `init-gcp-project.sh`) covering both pushes and repo management. Cloud Run service accounts get `roles/artifactregistry.reader` via Terraform. No further grants are needed for normal operation.

## Target 2: npm

**Scope:** `@cesteral/*` — public, scoped packages requiring `--access public` on every publish.
**Publisher:** `scripts/publish-all.sh` packs each package with `pnpm pack`, then publishes the resulting tarball with `npm publish <tarball>`. `pnpm pack` rewrites `@cesteral/shared`'s `"workspace:*"` dependency range to the resolved version _inside_ the tarball (a plain `npm publish` of a source directory would ship the literal `workspace:*` string and break consumers); `npm publish` then uploads that tarball and — in CI — attaches the provenance attestation. This split exists because the previously pinned `pnpm` (8.15) had no provenance support while `npm` (10.x) does; the repo now pins pnpm 10, which supports `pnpm publish --provenance`, so the split can be collapsed — see `docs/plans/2026-06-10-pnpm-provenance-followup.md`.
**Source of truth for version:** each package's `package.json` `version` field. Bump per release.

Release builds from `release.yml` attach **npm provenance** to every published tarball, and each governed `@cesteral/<server>-mcp` tarball additionally ships a `dist/cesteral-manifest.json` attestation manifest (consumed by the downstream governance system to verify provenance and bless tool hashes).

### Auth setup (first time on a new machine)

The `@cesteral` org enforces **2FA on publish**. `npm login` alone is **not sufficient** — its session token doesn't bypass 2FA at publish time, and the script publishes 14 packages back-to-back, which makes per-publish OTP prompts impractical (OTPs expire in 30s). You need a token that bypasses 2FA. Two paths:

1. **Granular Access Token (recommended).** npmjs.com → Profile → Access Tokens → "Generate New Token" → "Granular Access Token". Required settings:
   - **Permissions on the `cesteral` organization:** Read and write. This is a separate grant from per-user packages — without it, publishes to `@cesteral/*` are rejected with the misleading message "Two-factor authentication or granular access token with bypass 2fa enabled is required" (the underlying issue is missing org access, not the bypass-2FA flag).
   - **"Allow this token to bypass 2FA":** **checked**. Defaults to off.
   - **Expiration:** short (7–30 days) since this is a high-privilege token.

2. **Classic Automation Token.** Same dashboard → "Classic Token" → type **Automation**. Automation tokens bypass 2FA by design and inherit your org memberships, so no separate org-access grant is needed.

Install the token in `~/.npmrc` (note the leading `//` and trailing `:` in the key — without them, the value is silently ignored):

```bash
npm config set //registry.npmjs.org/:_authToken="npm_PASTE_TOKEN_HERE"
# Watch out for smart quotes from rich-text terminal apps — they break shell parsing.
# Verify:
npm whoami    # should print your npm username
```

**Revoke after publish.** Bypass-2FA tokens are sensitive. After a release lands, either:

- Run `npm token revoke <id>` (find the id with `npm token list`) and strip `_authToken` lines from `~/.npmrc`, or
- Delete the token via the npmjs.com dashboard.

For CI, set `NPM_TOKEN` in the build environment with the same kind of token; the npm CLI picks it up automatically.

### One-shot publish (all servers + shared)

The repo ships a single script that publishes in dependency order: the leaf contract libraries `@cesteral/contract-hash` and `@cesteral/contract-schema` first (because `@cesteral/shared` declares runtime deps on both, and the packed shared tarball references their resolved versions), then `@cesteral/shared` (servers depend on it), then each server. A real publish failure of either contract library aborts before shared is published. It also handles MCP Registry as a follow-up step.

```bash
./scripts/publish-all.sh                  # npm + MCP Registry
./scripts/publish-all.sh --npm-only       # npm only
./scripts/publish-all.sh --dry-run        # print what would happen
```

Re-publishing the same version is non-fatal — the script warns and continues, so you can rerun safely after a partial failure.

**Preflight gate:** before any publish, the script packs every package into a temp dir and inspects each tarball's `package.json` and file list. It refuses to publish if any tarball still contains a `workspace:` dependency range or is missing `LICENSE.md`. This catches the two failure modes that have actually bitten first publishes — silent `workspace:*` leakage from a misconfigured publisher, and `files` arrays that reference a per-package LICENSE that does not exist on disk.

### Manual publish for one package

```bash
cd packages/<server-name>
pnpm run build                            # ensure dist/ is fresh
pnpm publish --access public              # rewrites workspace:* deps
```

### What goes in the tarball

Each `package.json` has `"files": ["dist/", "README.md", "LICENSE.md"]`. Tests, fixtures, and source TS are excluded. `LICENSE.md` in each package is a symlink to the repo-root `LICENSE.md` so the Apache-2.0 grant ships with every tarball without duplicating the file 14 times in git.

### Version bumping

We use plain semver. There is no Changesets / lerna setup — bump `version` manually in the affected `package.json`, then regenerate registry manifests so `server.json` stays in sync:

```bash
pnpm run generate:registry                # regenerates packages/*/server.json
```

Commit `package.json` + `server.json` together.

### CI prerequisites

For automated npm publish from CI, set `NPM_TOKEN` in the build environment. The token must have **Automation** publish rights on the `@cesteral` org. Two-factor auth on the publishing account is required by npm policy.

## Target 3: MCP Registry

**Namespace:** `io.github.cesteral/*`
**Manifest:** `packages/<server>/server.json` (generated — never hand-edit).
**Verification:** GitHub OIDC via `mcp-publisher login github`. Each `package.json` carries an `mcpName` matching the manifest name; the registry validates this.

See [`mcp-registry-publishing.md`](./mcp-registry-publishing.md) for the full generator workflow, `registry.json` ↔ `server.json` ownership boundary, and validation checks. The short version:

```bash
brew install mcp-publisher                # one-time; alternative: curl install in ~/.local/bin
mcp-publisher login github                # one-time per shell — but see JWT expiry note below

# After bumping versions in package.json:
pnpm run sync:registry-tools              # refresh tool lists in registry.json
pnpm run generate:registry                # regenerate all server.json
pnpm run check:registry                   # CI gate — verify generated files match committed

# Publish (handled inside publish-all.sh):
for dir in packages/*-mcp; do (cd "$dir" && mcp-publisher publish); done
```

**Prerequisite:** the corresponding npm package version must already be live on npm, because the registry resolves the npm tarball during publish.

### Registry constraints (enforced server-side)

These are non-obvious from the schema docs and have rejected real publishes — keep them in mind when editing `registry.json`:

- **`description` ≤ 100 chars.** The registry rejects longer values with HTTP 422 `expected length <= 100`. `pnpm run generate:registry` does not pre-validate this; if you'd like a local guard, add a length check to the generator or rely on the first publish-time error.
- **`remotes[].url` must be globally unique across all publishers on the registry.** The registry stores the literal template string (e.g. `https://{host}/dbm-mcp/mcp`) as a unique key — `{host}` is **not** resolved before comparison. Our generator embeds each server's package name into the path via a `{server}` marker substituted at write time, which guarantees uniqueness across our 13 servers and avoids collisions with other publishers' templates. If you change `remoteUrlTemplate` in `registry.json`, keep the `{server}` marker.

### JWT expiry mid-run

`mcp-publisher login github` issues a short-lived JWT (observed ~10 minute lifetime). For a fresh `./scripts/publish-all.sh` run that does all 13 servers, the JWT can expire partway through the loop — surfacing as:

```
Error: publish failed: server returned status 401:
  "Invalid or expired Registry JWT token"
```

When this happens: the npm side is unaffected (it uses a different token), and the script's MCP Registry loop records each per-server failure and reports them at the end. Re-run `mcp-publisher login github`, then `./scripts/publish-all.sh` again — already-published packages are tolerated by the conflict regex on the npm side, and unpublished servers are picked up cleanly on the second pass. The full flow is idempotent.

## Release flow (recommended ordering)

The **routine release path is now the tag-triggered `.github/workflows/release.yml`**: pushing a `vX.Y.Z` git tag runs build + gate + attestation-manifest generation + `./scripts/publish-all.sh --provenance` (npm with provenance + MCP Registry publish) + `gh release create`. For a routine cross-cutting release that touches multiple servers, the local steps are:

1. **Verify clean** — `pnpm run build && pnpm run typecheck && pnpm run test`
2. **Bump versions** in affected `package.json` files
3. **Sync metadata** — `pnpm run sync:registry-tools && pnpm run generate:registry`
4. **Commit** the version + manifest changes; merge to `main`
5. **Tag the release** — push a `vX.Y.Z` git tag; `release.yml` picks it up and runs the rest of the pipeline.
6. **Smoke-test hosted:** `./scripts/deploy.sh dev` → verify → `./scripts/deploy.sh prod` → `./scripts/smoke-test.sh prod`

`./scripts/publish-all.sh` remains supported as a manual **break-glass** fallback — a manual run still generates manifests, but only a CI run from `release.yml` produces npm provenance attestations. When running it by hand: refresh auth first (`npm whoami` resolves, `mcp-publisher login github` run recently — its JWT is ~10 min), then `./scripts/publish-all.sh` (npm → MCP Registry). The script's pack-and-inspect gate validates every tarball before any publish; conflict-regex tolerance makes re-runs idempotent if anything partial lands.

The tag-triggered `release.yml` run (npm + MCP Registry publish) and the manual hosted deploy are independent — an operator does not need to wait for `release.yml` to finish before running `./scripts/deploy.sh`.

## Troubleshooting

### `npm publish` returns 403 — `cannot publish over the previously published versions`

The version already exists on npm — bump `version` in `package.json` and retry. `./scripts/publish-all.sh` matches this specific message via its conflict regex and tolerates it (logs `already published at this version — continuing`); a hard retry is safe.

### `npm publish` returns 403 — `Two-factor authentication or granular access token with bypass 2fa enabled is required`

The token used for the publish doesn't bypass 2FA. Several distinct causes give this same error message:

1. **No `_authToken` in `~/.npmrc` at all.** `npm login` alone doesn't write a bypass-2FA token. See [Auth setup](#auth-setup-first-time-on-a-new-machine).
2. **Granular token without the "Allow this token to bypass 2FA" checkbox.** The checkbox defaults to off when generating. Either regenerate with it checked, or switch to a Classic Automation Token (those bypass by design).
3. **Granular token without org access.** The "Packages and scopes: read and write access" grant only covers user-owned packages — `@cesteral/*` is org-owned. The token's **Organizations** section must include `cesteral` with Read and write access. Look at the token detail page on npmjs.com; if it says "This token has no access to organizations," that's the cause.
4. **Org-level 2FA-on-write policy set to "All writes"** (not "All writes except CI/CD tokens"). At that policy level, _no_ token bypass works. Check npmjs.com → `@cesteral` org → Settings.

### `npm publish` looks successful but `npm view` returns 404 for that package

Observed once during the 1.0.0 publish for `@cesteral/gads-mcp`: `pnpm publish` exited 0 but no tarball landed on the registry. Cause was not isolated. On retry, the second attempt published cleanly. Diagnosis path:

```bash
# Verify the gap is real (not stale cache)
npm view @cesteral/<pkg> --registry=https://registry.npmjs.org/

# Re-publish just that package
cd packages/<pkg> && pnpm publish --access public --no-git-checks
```

The publish loop is idempotent — `./scripts/publish-all.sh` can be re-run safely; the conflict regex will tolerate the 13 packages already live and only attempt the missing one.

### `mcp-publisher publish` fails with 422 `expected length <= 100`

A `description` in `registry.json` (and thus the generated `server.json`) exceeds 100 chars. Trim the description and regenerate:

```bash
# In registry.json, shorten the description for the offending server.
pnpm run generate:registry
pnpm run check:registry
```

### `mcp-publisher publish` fails with 400 `remote URL <url> is already used by server <other>`

The MCP Registry treats `remotes[].url` as a globally unique string across all publishers. The template — including unresolved `{host}` placeholders — must be unique. Our `remoteUrlTemplate` embeds `{server}` to encode the package name in the URL path; if you change the template, preserve that marker. See [Registry constraints](#registry-constraints-enforced-server-side).

### `mcp-publisher publish` fails with 401 `Invalid or expired Registry JWT token`

The GitHub-issued JWT has expired (observed ~10 min lifetime). Re-login and re-run:

```bash
mcp-publisher login github
./scripts/publish-all.sh   # idempotent; tolerates already-published packages
```

### `mcp-publisher publish` fails with "name mismatch"

The `mcpName` field in `package.json` must equal the `name` field in the generated `server.json`. If they drifted, run `pnpm run generate:registry` and re-commit.

### Cloud Run pulls an old image after deploy

Cloud Run pins to the SHA-tagged image, not `:latest`. If a deploy looks stale, check the revision's image digest via `gcloud run services describe <name> --region=europe-west2` — if it doesn't match the SHA you expected, the `deploy.sh` build step likely failed silently. Re-run with verbose output.

### Image not found at Cloud Run startup

The Cloud Run service account needs `roles/artifactregistry.reader` on the `cesteral` repo. This is normally granted by Terraform; if you've manually created services outside Terraform, you'll need to add it.
