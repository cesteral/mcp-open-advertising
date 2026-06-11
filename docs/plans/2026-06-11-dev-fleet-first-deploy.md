# Dev Fleet First Deploy to Cloud Run — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the 13-server MCP fleet on GCP Cloud Run in
`open-agentic-advertising-dev` for the first time, with
`allow_unauthenticated=true` and decision-token warn mode.

**Architecture:** Use the existing merged tooling unchanged —
`scripts/init-gcp-project.sh` (bootstrap), `scripts/deploy.sh` (build 13 Docker
images → push to Artifact Registry → `terraform apply` → `/health` gate). The
only authoring work is two **gitignored** local config files
(`terraform/backend-dev.conf`, `terraform/dev.tfvars`). No source changes.

**Tech Stack:** GCP Cloud Run, Terraform (Google provider ~> 5.45), Artifact
Registry, Secret Manager, Docker, gcloud SDK, bash.

**Design doc:** `docs/plans/2026-06-11-dev-fleet-first-deploy-design.md`

**Environment / preconditions (verified during brainstorming):**
- gcloud authed as `daniel@cesteral.com`; `open-agentic-advertising-dev` +
  `cesteral-governance` projects ACTIVE.
- `terraform` 1.14, `docker` 29, `gcloud` 517, `corepack pnpm` 10.34 present.
- `GOVERNANCE_DECISION_TOKEN_SECRET` (+ `_PREVIOUS`) already exist in the dev
  project. Real container name is upper/underscore — **not** the example's
  hyphen-case.
- `governance-invoker` SA does NOT exist yet → `authorized_invokers` stays empty;
  `allow_unauthenticated=true` (IAM-lock cutover = governance Phase D, later).

> **Operator gates:** Tasks 3 and 5 mutate live GCP (create resources, push
> images, apply). Do not run them without explicit operator confirmation. Tasks
> 1–2 and 4 are non-mutating (config + read-only plan).

> **Run everything from the worktree:** `.worktrees/deploy-dev-first-rollout`.
> Export the project once per shell: `export GCP_PROJECT_DEV=open-agentic-advertising-dev`.

---

### Task 1: Author the local config files (gitignored)

**Files:**
- Create: `terraform/backend-dev.conf` (gitignored — `*.conf` is not committed)
- Create: `terraform/dev.tfvars` (gitignored — `*.tfvars`)

**Step 1: Create `terraform/backend-dev.conf`** from the example, pointing at the
real state bucket:

```hcl
bucket = "open-agentic-advertising-dev-terraform-state"
prefix = "terraform/state"
```

**Step 2: Create `terraform/dev.tfvars`** by copying
`terraform/dev.tfvars.example` and changing exactly these values (leave the rest
as in the example):

- Replace every `YOUR_GCP_PROJECT_DEV` with `open-agentic-advertising-dev`
  (the `project_id` line **and** all 13 `*_mcp_image` URLs — though `deploy.sh`
  overrides the image vars per run, keep them consistent for hand-runs).
- `allow_unauthenticated = true`   # was `false` — see design doc
- `governance_token_secret_name = "GOVERNANCE_DECISION_TOKEN_SECRET"`   # real container name
- `artifact_registry_repo_name = "cesteral"`   # was `YOUR_REGISTRY`
- `monitoring_notification_email = "daniel@cesteral.com"`
- `gcs_bucket_name` — replace `YOUR_GCP_PROJECT_DEV` →
  `open-agentic-advertising-dev` (only used if `enable_gcs_persistence`, which
  stays `false`; keep it syntactically valid).

Leave `governance_token_mode = "warn"`, `log_level = "debug"`, scaling, and
networking blocks as the example has them.

**Step 2b: Empty the per-server platform secret maps (health-only first deploy).**
This is the critical addition. Every `*_secret_env_vars` default (`variables.tf:271+`)
wires `MCP_AUTH_SECRET_KEY` + platform creds (e.g. `cesteral-meta-access-token`)
as `secret_key_ref` with `version = "latest"`. On a fresh project those secret
containers are created **empty**, and a `secret_key_ref` to a version-less secret
**fails Cloud Run revision creation** before health checks ever run. The container
list (`secret_names`) is derived from these maps (`main.tf:160-172`), so emptying
them creates no containers and no refs. All 13 servers default to header/bearer/
token auth (`main.tf:206-220` — none use `jwt`), so `MCP_AUTH_SECRET_KEY` is
unused at boot and platform tokens arrive per-request; revisions boot clean and
`/health` returns 200. Append to `dev.tfvars`:

```hcl
# Health-only first deploy: no platform creds baked in. Servers run in their
# header/bearer/token auth modes (per-request auth); the governance decision-token
# secret is wired separately via governance_token_secret_name. Populate real
# per-platform secrets later (and drop these {} overrides) when a platform is
# actually exercised — at which point every referenced secret_name must hold a
# version first.
dbm_secret_env_vars        = {}
dv360_secret_env_vars      = {}
ttd_secret_env_vars        = {}
gads_secret_env_vars       = {}
meta_secret_env_vars       = {}
linkedin_secret_env_vars   = {}
tiktok_secret_env_vars     = {}
cm360_secret_env_vars      = {}
sa360_secret_env_vars      = {}
pinterest_secret_env_vars  = {}
snapchat_secret_env_vars   = {}
amazon_dsp_secret_env_vars = {}
msads_secret_env_vars      = {}
```

> Alternative (not chosen for the first deploy): keep the default maps and
> pre-create + populate **every** unique `secret_name` across all 13 services
> before deploy. Rejected because we don't have real creds for all 13 platforms
> yet and the smoke deploy only needs `/health` + warn-mode logging.

**Step 3: Verify the files are gitignored (not staged)**

> The worktree's `terraform/.gitignore` was fixed (commit `15e7a0f0`) to drop the
> `!dev.tfvars` / `!prod.tfvars` negations that previously **un**-ignored these
> files — so the check below now genuinely passes.

Run: `cd terraform && git status --porcelain backend-dev.conf dev.tfvars`
Expected: **no output** (both ignored).

**Step 4: Sanity-check tfvars parses**

Run: `cd terraform && terraform fmt -check dev.tfvars || terraform fmt dev.tfvars`
Expected: formats cleanly (no HCL syntax error). No commit (file is local-only).

---

### Task 2: Pre-flight verification (read-only)

**Step 1: Confirm the decision-token secret has a live version** (empty
`secret_key_ref` fails revision deploys):

Run:
```bash
gcloud secrets versions list GOVERNANCE_DECISION_TOKEN_SECRET \
  --project=open-agentic-advertising-dev --filter="state=enabled" --format="value(name)" | head
```
Expected: at least one enabled version. **If empty, STOP** — the secret must be
populated out-of-band (shared with the governance mint side) before deploy.

> With the Task 1 Step 2b `{}` overrides, this governance secret is the **only**
> `secret_key_ref` in the plan — the per-server platform secret maps are emptied,
> so there are no other empty-secret revision-failure risks. If you instead keep
> the default maps (the Step 2b "Alternative"), add a preflight that asserts an
> enabled version exists for **every** unique `secret_name` the plan references
> (e.g. iterate `terraform console`'s `*_secret_names` locals, or the
> `gcloud secrets versions list` check above per name) before Task 5.

**Step 2: Confirm tooling + auth**

Run:
```bash
gcloud config get-value account            # expect daniel@cesteral.com
export GCP_PROJECT_DEV=open-agentic-advertising-dev
gcloud projects describe "$GCP_PROJECT_DEV" --format='value(lifecycleState)'  # ACTIVE
terraform version | head -1; docker --version
```
Expected: account is the cesteral owner, project ACTIVE, both tools present.

**Step 3: Confirm Docker daemon is running** (deploy builds 13 images):

Run: `docker info >/dev/null 2>&1 && echo OK || echo "START DOCKER"`
Expected: `OK`. If not, start Docker Desktop before Task 5.

No commit (read-only).

---

### Task 3: Bootstrap the dev project  ⚠️ OPERATOR-GATED (mutates GCP)

**Step 1: Run the idempotent bootstrap**

Run:
```bash
export GCP_PROJECT_DEV=open-agentic-advertising-dev
./scripts/init-gcp-project.sh dev
```
This enables 13 APIs, creates the `cesteral` Artifact Registry repo, the
`<project>-terraform-state` + `<project>-build-artifacts` buckets (versioned
state bucket w/ lifecycle), and the `terraform-deployer` SA with its 11 roles
(incl. `serviceusage.serviceUsageAdmin`). Idempotent — safe to rerun.

Expected: ends with `[INFO] Initialization complete for open-agentic-advertising-dev`.

**Step 2: Verify the bootstrap artifacts**

Run:
```bash
gcloud artifacts repositories describe cesteral --location=europe-west2 --project=$GCP_PROJECT_DEV --format='value(name)'
gsutil ls -b gs://${GCP_PROJECT_DEV}-terraform-state
gcloud iam service-accounts describe terraform-deployer@${GCP_PROJECT_DEV}.iam.gserviceaccount.com --format='value(email)'
```
Expected: all three resolve without error.

---

### Task 4: Plan-only dry run (read-only apply preview)

**Step 1: Run the plan**

Run:
```bash
export GCP_PROJECT_DEV=open-agentic-advertising-dev
./scripts/deploy.sh dev --plan-only
```
On a fresh state this auto-runs `terraform init -backend-config=backend-dev.conf`
and `terraform import` of the pre-existing `cesteral` Artifact Registry repo
(avoids the 409 on first apply), then prints the plan.

**Step 2: Review the plan output**

Confirm:
- It plans to **create** (not destroy) the 13 `mcp-service` modules, networking,
  and monitoring.
- With the Step 2b `{}` overrides, the only `secret_key_ref` is the shared
  `GOVERNANCE_DECISION_TOKEN_SECRET` (covered by the Task 2 version check), and no
  per-server `google_secret_manager_secret.secrets` containers are planned.
- `allow_unauthenticated = true` is reflected: the plan creates an **`allUsers`
  `roles/run.invoker`** binding per service (`google_cloud_run_v2_service_iam_member.noauth`,
  expected) and **no** restricted `authorized_invokers` bindings
  (`...iam_member.invokers` is empty).

**If the plan shows destroys or an empty-secret reference, STOP** and reconcile
before Task 5. No commit (read-only).

---

### Task 5: Deploy  ⚠️ OPERATOR-GATED (builds, pushes, applies — billable)

**Step 1: Ensure Docker is running** (Task 2 Step 3).

**Step 2: Run the full deploy**

Run:
```bash
export GCP_PROJECT_DEV=open-agentic-advertising-dev
./scripts/deploy.sh dev
```
Builds + pushes 13 images to
`europe-west2-docker.pkg.dev/open-agentic-advertising-dev/cesteral/*`, applies
terraform (first apply enables runtime APIs + creates the 13 runtime SAs), then
polls each service `/health` (passes because `allow_unauthenticated=true`); a
failing service auto-rolls-back (no-op on first deploy).

Expected: terraform apply completes; health checks pass for all 13.

**Step 3: Capture the service URLs**

Run: `cd terraform && terraform output | grep service_url`
Expected: 13 `*.run.app` URLs.

---

### Task 6: Verify the live fleet

**Step 1: Health-check all 13 from outside**

Run (from `terraform/`):
```bash
for o in $(terraform output -json | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(v["value"]) for k,v in d.items() if k.endswith("service_url")]'); do
  printf "%s -> %s\n" "$o" "$(curl -s -o /dev/null -w '%{http_code}' "$o/health")"
done
```
Expected: every line ends `-> 200`.

**Step 2: Confirm decision-token warn-mode logging**

Run:
```bash
gcloud run services logs tail meta-mcp --region=europe-west2 --project=open-agentic-advertising-dev \
  | grep decision_token_verification
```
Expected: warn-mode lines. `MISSING_TOKEN` is normal until the governance mint
side lands. **Any steady `*_MISMATCH` is a cross-repo parity regression** —
stop and consult `docs/governance/decision-token-rollout-and-rotation.md`.

**Step 3: Record outcome**

Note the 13 service URLs in the worktree (e.g. append to the design doc or a
`docs/plans/2026-06-11-dev-fleet-deploy-results.md`) so the governance side can
populate `FLEET_INVOKER_ALLOWED_ORIGINS` later. Commit that results note (it's a
real artifact, not gitignored):

```bash
git add docs/plans/2026-06-11-dev-fleet-deploy-results.md
git commit -m "docs(deploy): record dev fleet service URLs + first-deploy outcome"
```

---

## Verification checklist (whole deploy)

- [ ] Task 1: `backend-dev.conf` + `dev.tfvars` exist, gitignored, parse cleanly.
- [ ] Task 2: `GOVERNANCE_DECISION_TOKEN_SECRET` has ≥1 enabled version; tooling/auth OK.
- [ ] Task 3: `init-gcp-project.sh dev` done; `cesteral` AR repo + state bucket + `terraform-deployer` SA exist.
- [ ] Task 4: `deploy.sh dev --plan-only` clean (creates only, no empty-secret ref, no invoker bindings).
- [ ] Task 5: `deploy.sh dev` applied; 13 images pushed; health gate passed.
- [ ] Task 6: 13 `/health` → 200; warn-mode `decision_token_verification` lines, no steady `*_MISMATCH`; URLs recorded.

## Deferred / follow-up (not in this plan)

- **Governance Phase D cutover** to `allow_unauthenticated=false` +
  `authorized_invokers=[governance-invoker SA]` — requires the SA to exist
  (governance Phase A) **and** a `deploy.sh` health-check made auth-aware (mint
  an identity token), else the post-apply gate rolls every service back.
- Prod deploy (`open-agentic-advertising-prod`).
