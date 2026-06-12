# Dev Fleet First Deploy to Cloud Run — Design

**Date:** 2026-06-11
**Branch / worktree:** `deploy/dev-first-rollout` (`.worktrees/deploy-dev-first-rollout`)
**Goal:** Stand up the 13-server MCP fleet on GCP Cloud Run in the **dev**
environment for the first time, runnable in parallel with the
`cesteral-intelligence` governance-invoker-auth work.

## Context

The deployment tooling is mature and already merged to `main` (PR #82, #83):
Terraform (`terraform/`), `scripts/init-gcp-project.sh`, `scripts/deploy.sh`,
`cloudbuild.yaml`, and `docs/guides/first-deploy-checklist.md`. Nothing has been
applied yet — this is a genuine first deploy (no local `*.tfvars`, no live
services).

### Grounding established during brainstorming

- **Repo identity:** the local `cesteral-mcp-servers` checkout and the
  `mcp-open-advertising` checkout are the **same** GitHub repo
  (`cesteral/mcp-open-advertising`). Deploying from here is the fleet the
  governance plan calls `mcp-open-advertising`.
- **Projects** (all under the `cesteral.com` org, id `347144434869`):
  | Project | Role |
  | --- | --- |
  | `cesteral-governance` | WIF pool + KMS + (future) `governance-invoker` SA |
  | `open-agentic-advertising-dev` | **dev fleet target — this deploy** |
  | `open-agentic-advertising-prod` | prod fleet (out of scope; dev-first) |
  The committed `*.tfvars.example` only carried `YOUR_GCP_PROJECT_DEV`
  placeholders; the real dev name comes from the governance plan's Phase D.
- **Secrets:** `GOVERNANCE_DECISION_TOKEN_SECRET` (+ `_PREVIOUS`) already exist
  in `open-agentic-advertising-dev`. The committed example sets
  `governance_token_secret_name = "governance-decision-token-secret"`
  (hyphen-case) which does **not** match the real container
  `GOVERNANCE_DECISION_TOKEN_SECRET` — our `dev.tfvars` must use the real name,
  and the secret must have a live version before apply (an empty `secret_key_ref`
  fails revision deploys).

## Key decision: invoker auth = `allow_unauthenticated = true` (first deploy)

The end-state the governance plan wants is `allow_unauthenticated = false` +
`authorized_invokers = ["serviceAccount:governance-invoker@cesteral-governance…"]`
(its Phase D). For the **first** deploy that is not yet viable, for two
independent reasons:

1. **`deploy.sh` health gate is unauthenticated.** `scripts/deploy.sh:160` polls
   `GET $SERVER_URL/health` with a plain `curl` expecting `200`. An IAM-locked
   service returns `403`, so all 13 services would be flagged unhealthy on the
   first deploy.
2. **The `governance-invoker` SA does not exist yet.** `cesteral-governance`
   exists, but the governance plan's Phase A (which _creates_ the SA) has not
   been applied, so `authorized_invokers` would reference a non-existent
   principal.

**Decision:** deploy dev with `allow_unauthenticated = true`. The servers still
enforce per-request platform-auth headers and decision-token **warn** mode, so
this is not "open" in any meaningful sense — it only skips the Cloud Run IAM
check. The flip to IAM-locked `authorized_invokers` is governance **Phase D**, a
later coordinated cutover.

**Follow-up flagged (not done here):** before Phase D flips the fleet to
`allow_unauthenticated = false`, `deploy.sh`'s health check must be made
auth-aware (mint an identity token via the deployer/an invoker SA), or the
post-apply gate will roll every service back. Captured so Phase D doesn't trip
on it.

## Key decision: empty the per-server platform secret maps (health-only deploy)

Every `*_secret_env_vars` default (`terraform/variables.tf:271+`) wires
`MCP_AUTH_SECRET_KEY` + platform creds (e.g. `cesteral-meta-access-token`) as a
Cloud Run `secret_key_ref` with `version = "latest"`. The container list TF
creates (`secret_names`) is derived from those maps. On a fresh project the
containers are created **empty**, and a `secret_key_ref` to a version-less secret
**fails revision creation** — before the health gate runs. (Caught in review;
the first draft only preflighted the governance secret.)

**Decision:** set all 13 `*_secret_env_vars = {}` in `dev.tfvars`. No containers,
no refs, revisions boot clean. Safe because all 13 servers default to
header/bearer/token auth modes (`terraform/main.tf:206-220` — none use `jwt`), so
`MCP_AUTH_SECRET_KEY` is unused at boot and platform tokens arrive per request.
The shared governance decision-token secret is wired by a separate path
(`governance_token_secret_name`) and already exists, so warn mode still works.

Populate real per-platform secrets (and drop the `{}` overrides) later, when a
platform is actually exercised — at which point each referenced `secret_name`
must hold a version first. Rejected alternative: pre-create + populate every
unique secret now (we lack creds for all 13 platforms, and the smoke deploy only
needs `/health` + warn-mode logging).

## Approach

Work in the isolated `deploy/dev-first-rollout` worktree. Only the `deploy.sh`
health-check fix (if undertaken) is a committed change; `dev.tfvars` and
`backend-dev.conf` stay local/gitignored.

### Flow

1. **Local config (gitignored):**
   - `terraform/backend-dev.conf` → bucket
     `open-agentic-advertising-dev-terraform-state`, prefix `terraform/state`.
   - `terraform/dev.tfvars` from the example, with:
     - `project_id = "open-agentic-advertising-dev"`
     - `governance_token_secret_name = "GOVERNANCE_DECISION_TOKEN_SECRET"`
     - `monitoring_notification_email = "daniel@cesteral.com"`
     - `allow_unauthenticated = true`
     - `artifact_registry_repo_name = "cesteral"` (or omit — `deploy.sh` pins it)
     - **all 13 `*_secret_env_vars = {}`** — see "Platform secrets" below.
2. **Bootstrap:** `./scripts/init-gcp-project.sh dev` — state bucket, Artifact
   Registry repo (`cesteral`), `terraform-deployer` SA + roles, enable APIs.
   Idempotent.
3. **Plan / pre-flight:** `./scripts/deploy.sh dev --plan-only`; with the `{}`
   overrides the only `secret_key_ref` is the shared
   `GOVERNANCE_DECISION_TOKEN_SECRET` — confirm it has a live version.
4. **Deploy:** `./scripts/deploy.sh dev` — build + push 13 images, `terraform
apply`, then the post-apply `/health` gate (passes because
   `allow_unauthenticated = true`).
5. **Verify:**
   - `/health` → 200 on all 13 service URLs.
   - `decision_token_verification` warn-mode lines in logs
     (`gcloud run services logs tail meta-mcp …`). `MISSING_TOKEN` is expected
     until the governance mint side lands; any steady `*_MISMATCH` is a
     cross-repo parity regression to stop on.

## Error handling / safety

- **Pre-production**, no live servers today — first apply only creates net-new
  resources in `open-agentic-advertising-dev`. Prod is untouched.
- Terraform `prevent_destroy` guards SAs/secrets/VPC.
- `deploy.sh` auto-imports the pre-existing Artifact Registry repo into state to
  avoid the 409 on first apply (PR #83), and rolls a service back to its prior
  revision on a failed health check (no-op on first deploy — no prior revision).
- An empty `GOVERNANCE_DECISION_TOKEN_SECRET` would fail revision deploys — hence
  the explicit pre-flight version check in step 3.

## Out of scope

- Prod deploy (`open-agentic-advertising-prod`).
- The IAM-locked `authorized_invokers` cutover (governance Phase D) and the
  `deploy.sh` health-check auth fix it requires — flagged above, tracked
  separately.
- Any governance-app (`cesteral-intelligence`) changes — that is the parallel
  workstream this deploy unblocks.

## Verification checklist

- [ ] `init-gcp-project.sh dev` completes; state bucket + `cesteral` AR repo +
      `terraform-deployer` SA exist.
- [ ] `deploy.sh dev --plan-only` clean; all referenced secrets have versions.
- [ ] `deploy.sh dev` applies; 13 images pushed to
      `europe-west2-docker.pkg.dev/open-agentic-advertising-dev/cesteral/*`.
- [ ] All 13 `/health` → 200.
- [ ] `decision_token_verification` warn-mode lines present (no steady
      `*_MISMATCH`).
