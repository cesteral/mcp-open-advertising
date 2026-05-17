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

**Scope:** `@cesteral/*` — public, scoped packages requiring `--access public` on every `npm publish`.
**Auth:** interactive (`npm login`) for manual runs; `NPM_TOKEN` env var for CI.
**Source of truth for version:** each package's `package.json` `version` field. Bump per release.

### One-shot publish (all servers + shared)

The repo ships a single script that publishes `@cesteral/shared` first (servers depend on it) and then each server in parallel-safe order. It also handles MCP Registry as a follow-up step.

```bash
./scripts/publish-all.sh                  # npm + MCP Registry
./scripts/publish-all.sh --npm-only       # npm only
./scripts/publish-all.sh --dry-run        # print what would happen
```

Re-publishing the same version is non-fatal — the script warns and continues, so you can rerun safely after a partial failure.

### Manual publish for one package

```bash
cd packages/<server-name>
pnpm run build                            # ensure dist/ is fresh
npm publish --access public
```

### What goes in the tarball

Each `package.json` has `"files": ["dist/", "README.md", "LICENSE"]`. Tests, fixtures, and source TS are excluded.

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
brew install mcp-publisher                # one-time
mcp-publisher login github                # one-time per shell

# After bumping versions in package.json:
pnpm run sync:registry-tools              # refresh tool lists in registry.json
pnpm run generate:registry                # regenerate all server.json
pnpm run check:registry                   # CI gate — verify generated files match committed

# Publish (handled inside publish-all.sh):
for dir in packages/*-mcp; do (cd "$dir" && mcp-publisher publish); done
```

**Prerequisite:** the corresponding npm package version must already be live on npm, because the registry resolves the npm tarball during publish.

## Release flow (recommended ordering)

For a routine cross-cutting release that touches multiple servers:

1. **Verify clean** — `pnpm run build && pnpm run typecheck && pnpm run test`
2. **Bump versions** in affected `package.json` files
3. **Sync metadata** — `pnpm run sync:registry-tools && pnpm run generate:registry`
4. **Commit** the version + manifest changes; merge to `main`
5. **Tag the release** in git (e.g. `v1.1.0`) so the published artifacts are traceable
6. **Publish stdio path:** `./scripts/publish-all.sh` (npm → MCP Registry)
7. **Publish hosted path:** `./scripts/deploy.sh dev` → verify → `./scripts/deploy.sh prod`
8. **Smoke-test hosted:** `./scripts/smoke-test.sh prod`

Steps 6 and 7 are independent and can run in parallel.

## Troubleshooting

### `npm publish` returns 403

- The version already exists on npm — bump `version` in `package.json` and retry. The script's "may already be published" warning is the same condition.
- Token lacks publish scope — re-issue with **Automation** rights on `@cesteral`.

### `mcp-publisher publish` fails with "name mismatch"

The `mcpName` field in `package.json` must equal the `name` field in the generated `server.json`. If they drifted, run `pnpm run generate:registry` and re-commit.

### Cloud Run pulls an old image after deploy

Cloud Run pins to the SHA-tagged image, not `:latest`. If a deploy looks stale, check the revision's image digest via `gcloud run services describe <name> --region=europe-west2` — if it doesn't match the SHA you expected, the `deploy.sh` build step likely failed silently. Re-run with verbose output.

### Image not found at Cloud Run startup

The Cloud Run service account needs `roles/artifactregistry.reader` on the `cesteral` repo. This is normally granted by Terraform; if you've manually created services outside Terraform, you'll need to add it.
