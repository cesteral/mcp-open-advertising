# Cesteral Scripts

Helper scripts for building, checking, releasing and deploying the Cesteral MCP servers. The deployment scripts are described in detail further down; this page starts with an index of everything.

## Script index

Most scripts have a `pnpm run` alias in the root `package.json`; use the alias where one is listed. A script path named in `package.json`, a workflow, Cloud Build or the Dockerfile is checked by `scripts/lib/script-path-references.test.mjs`, so a moved script fails CI instead of failing on a tag or a timer.

### Run, build and test locally

| Script                | Run it as                                       | What it does                                                                                                     |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dev-server.sh`       | `./scripts/dev-server.sh <server>`              | Runs one server locally on its registry port.                                                                    |
| `build-all.sh`        | `./scripts/build-all.sh`                        | Cleans, then builds every package with Turborepo.                                                                |
| `ci-local.mjs`        | `pnpm ci:local`                                 | Runs the PR CI workflow's steps locally. The steps are read from `.github/workflows/ci.yml` at run time.         |
| `conformance-test.sh` | `pnpm test:conformance` / `test:conformance:ci` | Runs the MCP conformance suite against one or all servers (`--full` runs the slow active suite).                 |
| `fleet.mjs`           | `node scripts/fleet.mjs servers`                | Prints the fleet's server list (or one server's `port`) from `registry.json`, for shell scripts and Cloud Build. |

### Deploy and operate (GCP)

| Script                | Run it as                                                | What it does                                                                  |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `init-gcp-project.sh` | `./scripts/init-gcp-project.sh <env>`                    | One-time bootstrap of a GCP project. [Details](#1-init-gcp-projectsh).        |
| `create-secrets.sh`   | `./scripts/create-secrets.sh <env>`                      | Creates the Secret Manager entries. [Details](#2-create-secretssh).           |
| `deploy.sh`           | `./scripts/deploy.sh <env> [--skip-build] [--plan-only]` | Builds and pushes the images, then applies Terraform. [Details](#3-deploysh). |
| `smoke-test.sh`       | `./scripts/smoke-test.sh <dev\|prod>`                    | For each deployed service, checks `/health` and an MCP `ping` on `/mcp`.      |

### Release

| Script                    | Run it as                                    | What it does                                                                                                                                  |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `publish-all.sh`          | `./scripts/publish-all.sh [--dry-run]`       | Publishes the packages to npm and the MCP Registry. The tag-triggered `release.yml` calls it. See [publishing](../docs/guides/publishing.md). |
| `inspect-tarball.mjs`     | `node scripts/inspect-tarball.mjs <tgz>`     | Pre-publish check of a packed tarball (called by `publish-all.sh`).                                                                           |
| `is-governed-package.mjs` | `node scripts/is-governed-package.mjs <pkg>` | Exit 0 if the package is `governed: true` in `registry.json` (called by `publish-all.sh`).                                                    |

### `check/`: guards that fail CI

Read-only; each exits non-zero on a violation.

| Script                                       | Alias                                                    | Guards against                                                                                              |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `check-account-scope.mjs`                    | `check:account-scope`                                    | A single-account tool that reads the session's account id but never calls `assertAccountScope()`.           |
| `check-contract-version-bump.mjs`            | `check:contract-version-bump`                            | Editing a contract library's `src/` without a version bump (PR guard).                                      |
| `check-contract-hash-published-parity.mjs`   | `check:contract-hash-parity`                             | The workspace `contract-hash` hashing differently from the published package (release guard).               |
| `check-contract-schema-published-parity.mjs` | `check:contract-schema-parity`                           | The workspace `contract-schema` accepting different annotations than the published package (release guard). |
| `check-doc-tool-counts.mjs`                  | `check:doc-tool-counts`                                  | The README fleet table's tool counts drifting from `registry.json`.                                         |
| `check-registry-runtime.mjs`                 | `check:registry-runtime`                                 | `registry.json` tools and prompts differing from what each built server advertises (needs a build).         |
| `check-platform-facts.mjs`                   | `check:platform-facts`, `check:platform-facts:freshness` | The platform-facts ledger disagreeing with the code, or expired facts (`--freshness`).                      |
| `check-terraform-drift.mjs`                  | `check:terraform-drift`                                  | Terraform state drifting from live GCP (needs Terraform and credentials; scheduled).                        |
| `check-dv360-codegen-drift.mjs`              | `check:dv360-codegen-drift`                              | The committed dv360 schemas differing from Google's live Discovery document (network; scheduled).           |

### `generate/`: generators and sync scripts

The sync scripts and `generate-server-json.mjs` take `--check` (or have a `check:` alias) to verify without writing.

| Script                            | Alias                                         | What it writes                                                                                            |
| --------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `generate-manifests.mjs`          | `generate:manifests`                          | `dist/cesteral-manifest.json` for every package with governed tools (needs a build).                      |
| `generate-server-json.mjs`        | `generate:registry`, `check:registry`         | Each package's MCP Registry `server.json`, from `registry.json` and `package.json`.                       |
| `sync-registry-tools.mjs`         | `sync:registry-tools`, `check:registry-tools` | The tool lists in `registry.json`, from the tool definition files.                                        |
| `sync-registry-data.mjs`          | `sync:registry-data`                          | `packages/shared/src/utils/transport/registry-data.generated.ts`, run by `@cesteral/shared`'s `prebuild`. |
| `sync-untrusted-declarations.mjs` | `sync:untrusted-declarations`                 | `scripts/lib/untrusted-declarations.snapshot.json`; run after an intended `untrustedContent` change.      |

### `lib/` and `__tests__/`

- `lib/` holds the modules the scripts share (server boot harness and fleet snapshot, manifest building, ledger and audit logic) and the repo-wide invariant tests that read every server, such as write-tool governance coverage and the script-path guard. Their allowlists and snapshots (`*.json`) live beside them.
- `__tests__/` holds the tests for the scripts in `check/`, for `ci-local.mjs` and `publish-all.sh`, and the pin on the release workflow's identity.
- Both are run by `pnpm test:scripts` (Vitest, config in `vitest.config.scripts.ts`), which CI runs on every pull request. These tests read built servers, so run `pnpm run build` first.

#### Booting servers in the suite: use the fleet snapshot

A cold in-process boot of a server imports its whole `dist` graph, and every test file runs in its own worker, so a suite that boots its own servers pays that once per file: 316 boots per run before the snapshot, which is also what made the suite flake under load. Instead, vitest's `globalSetup` (`lib/fleet-snapshot-global-setup.mjs`) boots each server **once**, collects what any client can ask of it, and hands that to every test file:

```js
import { serverSnapshot, toolsOf } from "./fleet-snapshot-inject.mjs";

toolsOf("meta-mcp"); // the raw tools/list wire objects, `cesteral` annotations intact
serverSnapshot("meta-mcp"); // { serverVersion, capabilities, tools, prompts, resources }
```

- `prompts[].renders` holds each prompt rendered with its required arguments set to `"x"`, plus every argument set listed in `PROMPT_ARG_SETS` (`lib/fleet-snapshot.mjs`). A suite that needs a prompt rendered another way adds its argument set there; it does not boot a server.
- A snapshot is plain JSON shared by every file: read it, never mutate it.
- Running a single test file through `vitest.config.scripts.ts` still runs `globalSetup`, so it boots the whole fleet once first.

Boot a server yourself (`withServerClient` from `lib/boot-server.mjs`) only when the test must **drive** it or compare a fresh boot. Three suites do, one boot per server each:

| Suite                            | Why it cannot read the snapshot                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tools-list-determinism.test`    | Compares a fresh boot with the snapshot's boot (another process): reading the snapshot twice proves nothing. |
| `untrusted-error-marker.test`    | Calls every tool with empty arguments to read the error results.                                             |
| `evals/tool-search-ranking.test` | Runs the corpus's queries against each server's live `*_search_tools`.                                       |

`boot-server.test` boots `meta-mcp` once, to test the harness itself. `tools-list-determinism.test` is also what proves the snapshot is what a live boot returns, for every server.

## Deployment scripts

### 1. `init-gcp-project.sh`

Initializes a GCP project with all required resources and configurations.

**Usage:**

```bash
./scripts/init-gcp-project.sh <environment>
```

**Example:**

```bash
./scripts/init-gcp-project.sh dev
```

**What it does:**

- Enables required GCP APIs (Cloud Run, Secret Manager, etc.)
- Creates Artifact Registry repository for container images
- Creates GCS bucket for Terraform state with versioning
- Creates Terraform service account with necessary permissions
- Creates GCS bucket for build artifacts

**Prerequisites:**

- gcloud CLI installed and authenticated
- Project Owner or Editor role in the target GCP project
- Update project IDs in the script before running

### 2. `create-secrets.sh`

Interactively creates and populates Secret Manager secrets.

**Usage:**

```bash
./scripts/create-secrets.sh <environment>
```

**Example:**

```bash
./scripts/create-secrets.sh dev
```

**What it does:**

- Creates Secret Manager secrets for the full 13-server fleet
- Covers shared auth plus DBM/DV360/CM360 service-account JSON, Google Ads, SA360, TTD, Meta, LinkedIn, TikTok, Pinterest, Snapchat, Amazon DSP, and Microsoft Ads credentials
- Prompts for each secret value interactively
- Stores secrets securely in Secret Manager

**Prerequisites:**

- `init-gcp-project.sh` must be run first
- Have all API credentials ready before running

**Tips:**

- Generate JWT secret: `openssl rand -base64 32`
- You can re-run to update existing secrets

### 3. `deploy.sh`

Builds Docker images for all servers and deploys infrastructure using Terraform.

**Usage:**

```bash
./scripts/deploy.sh <environment> [--skip-build] [--plan-only]
```

**Examples:**

```bash
# Full deployment (build + deploy)
./scripts/deploy.sh dev

# Deploy with existing image (skip build)
./scripts/deploy.sh dev --skip-build

# Only run Terraform plan (no apply)
./scripts/deploy.sh dev --plan-only

# Production deployment (requires confirmation)
./scripts/deploy.sh prod
```

**What it does:**

- Builds Docker images for all 13 servers: `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, `tiktok-mcp`, `cm360-mcp`, `sa360-mcp`, `pinterest-mcp`, `snapchat-mcp`, `amazon-dsp-mcp`, and `msads-mcp`
- Pushes images to Artifact Registry
- Initializes Terraform with environment-specific backend
- Runs Terraform plan
- Applies Terraform configuration (creates/updates infrastructure)
- Displays service URLs and helpful commands

**Prerequisites:**

- Docker installed and running
- Terraform installed (>= 1.5.0)
- `init-gcp-project.sh` and `create-secrets.sh` must be run first
- Update project IDs in tfvars files

**Flags:**

- `--skip-build`: Skip Docker build and push, use existing image
- `--plan-only`: Only run `terraform plan`, don't apply changes

## Deployment Workflow

### Initial Setup (One-time per environment)

1. **Initialize GCP Project**

   ```bash
   ./scripts/init-gcp-project.sh dev
   ```

2. **Create Secrets**

   ```bash
   ./scripts/create-secrets.sh dev
   ```

3. **Initial Deployment**
   ```bash
   ./scripts/deploy.sh dev
   ```

### Regular Deployments

For code changes or configuration updates:

```bash
# Full deployment
./scripts/deploy.sh dev

# Or for faster deployment if image hasn't changed:
./scripts/deploy.sh dev --skip-build
```

### Production Deployment

Production deployments require extra confirmation:

```bash
# Always test with plan first
./scripts/deploy.sh prod --plan-only

# Review plan, then deploy
./scripts/deploy.sh prod
# (will prompt for confirmation)
```

## Alternative: Cloud Build

`cloudbuild.yaml` tests, builds, scans and pushes the images. It is build-only unless `_DEPLOY=true`, which needs a service account allowed to apply the Terraform stack; see `docs/guides/deployment-instructions.md`.

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --region=europe-west2 \
  --substitutions=_ENVIRONMENT=dev,SHORT_SHA=$(git rev-parse --short=8 HEAD) \
  --project=YOUR_GCP_PROJECT_DEV
```

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/*.sh
```

### gcloud not authenticated

```bash
gcloud auth login
gcloud auth application-default login
```

### Docker not running

```bash
# macOS/Windows
# Start Docker Desktop

# Linux
sudo systemctl start docker
```

### Terraform state locked

```bash
# If deployment failed mid-run
cd terraform
terraform force-unlock <LOCK_ID>
```

### Secret not found

```bash
# List secrets
gcloud secrets list --project=YOUR_GCP_PROJECT_DEV

# Re-run secret creation
./scripts/create-secrets.sh dev
```

## Manual Commands

### View Cloud Run services

```bash
for SERVICE in dbm-mcp dv360-mcp ttd-mcp gads-mcp meta-mcp linkedin-mcp tiktok-mcp cm360-mcp sa360-mcp pinterest-mcp snapchat-mcp amazon-dsp-mcp msads-mcp; do
  gcloud run services describe "$SERVICE" \
    --region=europe-west2 \
    --project=YOUR_GCP_PROJECT_DEV
done
```

### View logs

```bash
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name=~"(dbm|dv360|ttd|gads|meta|linkedin|tiktok|cm360|sa360|pinterest|snapchat|amazon-dsp|msads)-mcp"' \
  --limit 50 \
  --project=YOUR_GCP_PROJECT_DEV
```

### Test health endpoints

```bash
for SERVICE in dbm-mcp dv360-mcp ttd-mcp gads-mcp meta-mcp linkedin-mcp tiktok-mcp cm360-mcp sa360-mcp pinterest-mcp snapchat-mcp amazon-dsp-mcp msads-mcp; do
  SERVICE_URL=$(gcloud run services describe "$SERVICE" \
    --region=europe-west2 \
    --project=YOUR_GCP_PROJECT_DEV \
    --format='value(status.url)')
  curl "$SERVICE_URL/health"
done
```

## Security Notes

- Never commit secrets or sensitive values to git
- All secrets are stored in Secret Manager, not in code
- Service accounts follow principle of least privilege
- Production deployments require manual confirmation
- Terraform state is encrypted and versioned in GCS
