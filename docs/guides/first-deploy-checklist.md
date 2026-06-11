# First Deploy Checklist (per environment)

One-time bootstrap for deploying the MCP fleet to a **fresh GCP project**
(dev or prod). Routine redeploys after this are just
`./scripts/deploy.sh <env>` — see
[deployment-instructions.md](./deployment-instructions.md).

## Prerequisites (your machine)

- `gcloud` authenticated as a project owner/editor of the target project
- `docker` (builds 13 images locally), `terraform >= 1.5`
- `export GCP_PROJECT_DEV=<project-id>` (or `GCP_PROJECT_PROD` for prod)

## 1. Bootstrap the project

```bash
./scripts/init-gcp-project.sh <dev|prod>
```

Idempotent — safe to rerun. Creates the **terraform state bucket**, the
**Artifact Registry repo** (`cesteral`), and the `terraform-deployer` SA with
its roles (including `roles/serviceusage.serviceUsageAdmin`, which terraform's
managed `google_project_service` resources need), and enables the project
APIs. The registry must exist before `deploy.sh` can push images, so don't
skip this even though terraform also manages APIs now.

> Re-running on a project bootstrapped before June 2026 is how you pick up the
> `serviceusage.serviceUsageAdmin` grant added for `enable_required_apis`.

## 2. Create the local config files (gitignored)

```bash
cd terraform
cp backend-<env>.conf.example backend-<env>.conf   # state bucket from step 1
cp <env>.tfvars.example <env>.tfvars
```

In `<env>.tfvars`, set at minimum:

- `project_id`, `monitoring_notification_email`
- `artifact_registry_repo_name = "cesteral"` — or delete the line (the
  variable defaults to `cesteral`, and `deploy.sh` pins it anyway). Do **not**
  leave a placeholder value: `deploy.sh` pushes to the hardcoded `cesteral`
  repo, and a mismatched tfvars name would point Cloud Run at images that
  were never built.
- `governance_token_secret_name` — must match the Secret Manager container
  that actually holds the decision-token signing secret, and that container
  must already have a **version** (a `secret_key_ref` to an empty secret
  fails revision deploys). Dev-first: leave this commented in prod until the
  prod value is set.
- The `*_mcp_image` variables in the example are placeholders — `deploy.sh`
  overrides them per run with the SHA it just built, so their tfvars values
  are only used when running terraform by hand.

### Invoker access (who may call the services)

The examples default to `allow_unauthenticated = false` with no
`authorized_invokers` — after the first deploy **nothing can invoke the
services**, including the governance layer. Pick one:

- `allow_unauthenticated = true` (simplest for dev; the servers still require
  per-request platform auth headers, so "unauthenticated" only means no Cloud
  Run IAM check), or
- `authorized_invokers = ["serviceAccount:..."]` with a principal the
  governance layer can present as a Google identity token.

## 3. Deploy

```bash
./scripts/deploy.sh <env>            # build + push 13 images, then terraform
./scripts/deploy.sh <env> --plan-only  # dry-run the terraform side
```

Notes on what the script now handles for you:

- **Artifact Registry import**: the repo from step 1 is also a terraform
  resource; on a fresh state `deploy.sh` detects this and runs
  `terraform import` automatically before planning (otherwise the first
  apply would fail with 409 already-exists).
- **API enablement**: the first apply enables the runtime APIs
  (`run.googleapis.com` etc., `enable_required_apis = true` by default) and
  creates the 13 runtime service accounts.
- **Health checks**: after apply, each service's `/health` is polled; a
  failing service is rolled back to its previous revision automatically.

## 4. Verify the governance token chain (dev)

With the fleet up in `warn` mode and the secret wired, run a governed write
from the governance layer and watch the audit logs:

```bash
gcloud run services logs tail meta-mcp --region=europe-west2 \
  | grep decision_token_verification
```

Healthy: `ok: true` with `definitionHashVerified: true`. Expected noise before
the mint side attaches tokens: `MISSING_TOKEN` (warn-mode, non-blocking).
Any steady `*_MISMATCH` is a cross-repo parity regression — see
[decision-token-rollout-and-rotation.md](../governance/decision-token-rollout-and-rotation.md)
before staging any contract to enforce.

## Prod differences

- Set the prod secret value first
  (`gcloud secrets versions add <name> --data-file=-`), then uncomment
  `governance_token_secret_name` in `prod.tfvars`.
- `deploy.sh prod` shows the full plan and asks for interactive confirmation
  before applying.
