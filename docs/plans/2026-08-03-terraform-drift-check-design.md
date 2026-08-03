# Design: scheduled Terraform state drift check

**Date:** 2026-08-03
**Closes follow-up:** `docs/runbooks/2026-07-27-dev-fleet-lb-recovery.md` → "Terraform state drift is not monitored"

## Problem

A closed billing account had GCP reclaim 43 resources of the dev fleet — the load
balancer, VPC, serverless subnet, Cloud Router, Cloud NAT and 3 firewall rules.
Terraform state still listed every one of them as existing. Nothing detected it
for a week; it surfaced by accident during a `terraform plan` for unrelated work.
`mcp.cesteral.com` was dead the whole time.

The 13 Cloud Run services were never affected, which is precisely why nothing
looked wrong from the inside.

## Measured baseline

Design decisions here are grounded in a real `terraform plan` against live dev
state (2026-08-03, Terraform 1.14.5, plan JSON `format_version` 1.2):

| bucket                                       | count | verdict                      |
| -------------------------------------------- | ----- | ---------------------------- |
| `resource_changes` `["no-op"]`               | 239   | clean                        |
| `resource_changes` `["update"]`              | 1     | dashboard JSON normalization |
| `resource_changes` create / delete / replace | **0** | the alertable bucket, empty  |
| `resource_drift` `["update"]`                | 49    | **100% provider noise**      |

All 49 `resource_drift` entries were inspected attribute by attribute. Every one
is API normalization: `null → []`, `null → {}`, a server-computed
`expire_time` on the managed certificate, and alert-policy `conditions`
reordering. **Not one represents a real-world change anyone made.**

This is the single most important finding. Alerting on `resource_drift` would
fire on every run forever — rebuilding exactly the failure mode that hid the
outage, where 13 uptime checks had been permanently red because they asserted
`200` against a fleet that correctly returns `403`.

## Signal

Alert on `resource_changes` whose action array is `["create"]`, or contains
`"delete"`. HashiCorp documents exactly seven action arrays and states that the
two replace forms are shaped as they are so callers can "just scan the list for
`delete`" — so scanning matches the format's stated intent.

| action array                                  | treatment                      |
| --------------------------------------------- | ------------------------------ |
| `["create"]`                                  | **alert** — 68 during recovery |
| `["delete"]`                                  | **alert**                      |
| `["delete","create"]` / `["create","delete"]` | **alert** (replace)            |
| `["no-op"]`                                   | tolerate                       |
| `["update"]`                                  | tolerate, report count         |
| `["read"]`                                    | tolerate — see below           |
| anything else                                 | **exit 2**, fail closed        |

`["read"]` is tolerated _explicitly and by name_. Filtering on
`actions != ["no-op"]` sweeps in data-source refreshes; during the recovery that
made 13 refreshing `google_secret_manager_secret` data sources look like 13
creates of the same secret ID — a phantom `ALREADY_EXISTS` blocker that did not
exist.

### What this detector actually is

A normal plan reconciles three things: live infrastructure, state, and the
checked-out configuration. So a resource merged but never applied also yields
`["create"]`, and one deleted from config yields `["delete"]`. This is an
**unexpected-reconciliation-action detector**, not a pure out-of-band drift
detector. That breadth is wanted — "live does not match `main`" is worth knowing
either way — but the report must not misrepresent its own evidence.

So each alerting address is labelled by cross-referencing `resource_drift`:

- **also in `resource_drift`** → corroborated external change
- **only in `resource_changes`** → likely unapplied config or state/config mismatch

The cross-reference is **advisory only and never gating**. HashiCorp documents
`resource_drift` as "changes Terraform detected when it compared the most recent
state to the prior saved state" but does _not_ guarantee remotely-deleted objects
appear there. If a vanished resource is omitted, the alert still fires on its
`["create"]` — it only loses the label. Correctness must not depend on
undocumented behaviour.

### Deliberately not alerted

Remote mutations that reconcile to an in-place `["update"]` — someone widening a
firewall rule by hand, say — are **not** alerted. That is a real gap, accepted
because 49 of 49 observed update-drifts were provider noise and no attribute
allowlist survives provider upgrades. This detector targets the outage signature:
resources vanishing. The runbook states this limitation plainly.

## Exit codes

Mirrors `check-dv360-codegen-drift.mjs`: `0` clean, `1` drift, `2` could not check.

**`terraform plan -detailed-exitcode` is deliberately not used.** Its convention
is `2 = changes present, 1 = error` — exactly inverted from this repo's. Wrapping
it invites a silent mix-up in which "could not check" reads as "drift found", or
worse. The script runs a plain `terraform plan` (`0` = ok, non-zero → exit 2) and
classifies from `terraform show -json`, which is the "or equivalent" and yields
resource addresses rather than a boolean.

Everything that is not a confident clean result is exit 2: missing binary,
missing backend config or tfvars, absent credentials, failed `init` (the
`UserProjectAccountProblem` case that first surfaced the outage), failed `plan`,
unsupported `format_version`, malformed or missing `resource_changes`, or an
action array outside the documented seven.

**Empty output is never evidence of absence.** `terraform state list` returns
empty _and exit 0_ when the token has expired; that produced two wrong
conclusions during the incident, including a claim in the first runbook draft
that `module.monitoring` had never been applied when it had ~69 resources in
state. Every subprocess exit code is checked explicitly. A unit test with an
injected runner returning nonzero and empty stdout pins this permanently.

## Components

1. **`scripts/check-terraform-drift.mjs`** — pure `classifyPlan(planJson)` export
   plus subprocess orchestration behind an injectable runner. Refuses a dirty
   tree scoped to `terraform/`. Plan artifacts are written to a mode-`0700`
   `mkdtemp` directory removed in a `finally`, because a saved plan contains full
   configuration and sensitive values in cleartext; only addresses and actions
   reach logs or issues.

2. **`.github/workflows/terraform-drift.yml`** — daily schedule (weekly is what
   failed; the outage ran seven days) plus `workflow_dispatch`. Never on the PR
   path: it depends on external state, and gating PRs hands an outside system a
   switch to redden `main`. Needs `contents: read`, `id-token: write` for OIDC,
   `issues: write` for issue mutation, and a concurrency group so a dispatch
   cannot race the schedule.

3. **Issue lifecycle** — deduplicated by a stable HTML marker
   `<!-- terraform-drift:<env> -->`, not by title, so the title can change
   between "drift detected" and "check failed" without orphaning the issue. The
   issue is updated when status changes and **closed automatically after a clean
   run**; a recovered environment must not leave a permanently open warning.
   Issue handling runs under `if: always()` so WIF-auth and setup failures are
   captured as exit 2 rather than silently skipping the alert, and a final step
   restores the nonzero job result afterwards.

4. **`terraform/drift-check.tf`** — WIF pool and provider plus a read-only
   `terraform-drift-reader` SA, gated behind `enable_drift_check_reader`
   (default `false`). Provider attribute condition restricts assertions to this
   repository _and_ `refs/heads/main` — `workflow_dispatch` can target an
   arbitrary branch, so without the ref condition any branch author could mint a
   credential. Bound with numeric GitHub repository and owner IDs, which cannot
   be reclaimed the way names can. `roles/viewer` is **broad read-only**, not
   least privilege: it carries thousands of evolving permissions. The plan runs
   `-lock=false`, so no state write access is needed.

5. **Provider pinning** — `terraform/.terraform.lock.hcl` (google 5.45.2) is
   currently untracked, though `terraform/README.md` claims it is committed and
   `terraform/.gitignore` deliberately leaves it tracked. A bare
   `.terraform.lock.hcl` at root `.gitignore:56` matches at any depth and
   overrides both. This matters directly: provider upgrades change normalization
   and refresh behaviour, which _is_ the signal being classified. The lock file
   is committed, the CLI pinned to the version used for verification, and `init`
   runs `-lockfile=readonly -input=false`.

## Configuration bootstrap gotcha

Both `terraform/dev.tfvars` and `terraform/backend-dev.conf` are gitignored. CI
materializes the tfvars from a GitHub secret and generates the backend config
inline. **That secret must set `enable_drift_check_reader = true`** to match what
was applied — otherwise the checker plans deletion of its own identity on every
run and alerts on itself forever.

## Environments

`open-agentic-advertising-prod` exists but holds **zero buckets** — verified with
an explicit exit-code check, not an empty-output inference — so it has no
Terraform state and nothing to drift-check. The script takes an environment
argument; the workflow matrix ships `dev` only, and prod is a one-line addition
once its state exists.

## Verification

`terraform fmt -check -recursive` and `validate`; unit tests via
`pnpm run test:scripts`; a real run against live dev state expecting exit 0; and
a real invalid-token run expecting exit 2 — the direct regression test for the
expired-token-reads-as-clean trap.

## Non-goals

Detection only. Nothing is applied, and nothing is added to the PR-blocking path.
A `403` from the fleet is the correct, deliberate IAM-locked posture; a `200`
would be the security regression. This work does not touch that.
