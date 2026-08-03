# Runbook: recover the dev fleet load balancer (mcp.cesteral.com)

**Status:** recovery applied 2026-08-03 — **awaiting a DNS change** (see [Remaining](#remaining))
**Outage window:** ~2026-07-27 → 2026-08-03
**Project:** `open-agentic-advertising-dev`

## What was actually lost

A closed billing account had GCP reclaim infrastructure. The first version of this
runbook recorded the load balancer only. The Terraform plan run before recovery
showed the blast radius was **wider than the LB**:

| component                         | lost | restored 2026-08-03 |
| --------------------------------- | ---- | ------------------- |
| Global address + forwarding rules | yes  | yes (new IP)        |
| 13 backend services + 13 NEGs     | yes  | yes                 |
| URL maps, proxies, SSL policy     | yes  | yes                 |
| Managed SSL certificate           | yes  | provisioning        |
| **VPC + serverless subnet**       | yes  | yes                 |
| **Cloud Router + Cloud NAT**      | yes  | yes                 |
| **3 firewall rules**              | yes  | yes                 |
| 13 Cloud Run services             | no   | never affected      |
| Secret Manager secrets            | no   | never affected      |

The Cloud Run services survived throughout, which is exactly why nothing looked
wrong from the inside.

## What was NOT broken — do not "fix" this

**403 from any service, or from `mcp.cesteral.com`, is correct.**

All 13 services are bound to a single invoker:

```
serviceAccount:governance-invoker@cesteral-governance.iam.gserviceaccount.com
```

`terraform/dev.tfvars` sets `allow_unauthenticated = false` deliberately — the org
policy (Domain Restricted Sharing / `iam.allowedPolicyMemberDomains`) forbids
`allUsers` outright, so an apply with it set to `true` fails with "do not belong to
a permitted customer". This is the documented production posture and the completed
governance Phase D IAM lock.

So a 403 is the success condition: it proves TLS terminated and a live backend
applied IAM. A **200 would mean the IAM lock is gone** and the fleet is answering
anonymous callers — a security regression, not a recovery.

## Why nothing detected it for a week

Three compounding causes. All three are now fixed in code; the third needed the
apply that has since happened.

1. **The uptime checks watched the wrong thing.** They targeted each service's own
   `cloud_run_service_url`, which stays healthy whether or not anything fronts it.
   DNS, the LB, path routing and the certificate were unmonitored. Fixed by
   `google_monitoring_uptime_check_config.fleet_lb` (13 checks against the fleet
   domain, per-service paths) plus matching alert policies.

2. **They asserted `200`, which a correctly-locked fleet can never return.** An
   uptime checker is an anonymous caller, so it sees the auth posture rather than
   `/health`. These 13 checks existed and were **failing continuously** — with
   alert policies wired to an email channel. Permanently-red checks are
   indistinguishable from a real outage, which is how a real one hid. The expected
   status is now derived from `allow_unauthenticated` (403 when locked).

3. **The LB had no check at all.** Now it does.

> An earlier draft of this runbook claimed `module.monitoring` had never been
> applied. That was wrong — it has ~69 resources in state and the 13 checks were
> live. The claim came from a `terraform state list` run with an expired token,
> whose empty output was misread as "no resources" rather than "the command
> failed". Corrected here because the difference matters: the checks were not
> dormant, they were actively crying wolf.

## Recovery as performed (2026-08-03)

```bash
gcloud auth login daniel@cesteral.com
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token --account=daniel@cesteral.com)
cd terraform
terraform init -backend-config=backend-dev.conf -reconfigure
terraform plan -var-file=dev.tfvars -out=/tmp/recovery.plan
terraform apply /tmp/recovery.plan
```

Result: **68 created · 14 updated · 0 destroyed.**

- 35 `module.fleet_lb` · 26 `module.monitoring` · 7 `module.networking`
- 14 updates were the per-service uptime checks flipping 200 → 403, plus the dashboard
- No Cloud Run service and no secret was touched

### Two traps worth knowing before the next one

**`-target` drags in dependencies.** `terraform apply -target=module.monitoring`
looks narrow but pulls the whole VPC/subnet/router/NAT/firewall set with it,
because monitoring reads `module.*_mcp.cloud_run_service_url` and those modules
depend on networking. Cloud NAT bills hourly, so this is not a free surprise. A
single reviewed full apply beat three targeted ones here.

**Data-source reads look like creates in plan JSON.** Filtering
`resource_changes` on `actions != ["no-op"]` sweeps in `["read"]` entries. During
this recovery that briefly made 13 refreshing `google_secret_manager_secret` data
sources look like 13 creates of the same secret ID — an apparent
ALREADY_EXISTS blocker that did not exist. Filter on `actions == ["create"]`.

## Remaining

**1. Point DNS at the new IP.** The address was recreated, so the old one is gone
for good:

```
old (dead) 34.149.102.189
new        34.120.250.208
```

**2. Wait for the certificate.** It cannot provision until DNS resolves to the new
IP — Google validates ownership by resolving the record to the LB.

```bash
gcloud compute ssl-certificates describe mcp-fleet-cert \
  --global --project=open-agentic-advertising-dev \
  --format='value(managed.status,managed.domainStatus)'
```

`PROVISIONING` → `ACTIVE` typically takes 15–60 minutes after DNS resolves.

**3. Verify.** Expect **403**, not 200:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mcp.cesteral.com/dv360/health
```

A TLS error or 502 means the recovery is incomplete. A 200 means the IAM lock is
gone.

## Follow-ups this exposed

- **Check `cesteral-intelligence` for a pinned IP or custom audience** tied to the
  destroyed LB before declaring the integration healthy. The address changed.
- **Billing alerting.** The root cause was a closed billing account, and the first
  symptom anyone saw was `UserProjectAccountProblem` on the Terraform state bucket
  — days later, during unrelated work.
- ~~**Terraform state drift is not monitored.**~~ **Closed 2026-08-03.** State
  claimed 35 LB resources and 8 networking resources that no longer existed.
  `scripts/check-terraform-drift.mjs` + `.github/workflows/terraform-drift.yml`
  now plan daily and alert on divergence. See the section below for what it does
  and does not catch, and `docs/plans/2026-08-03-terraform-drift-check-design.md`
  for the reasoning.

## Drift detection (added 2026-08-03)

`pnpm run check:terraform-drift <env>` runs a plan and classifies it. The
scheduled workflow runs it daily against dev and tracks the result in a single
GitHub issue that it opens, updates, and **closes again on a clean run** — a
recovered environment must not leave a permanent warning sitting open.

Exit codes: `0` clean, `1` drift, `2` could not check. The last one is not a
lesser failure — it alerts identically, because an unchecked environment is
exactly the state the fleet was in for the week of this outage.

### What it alerts on

`resource_changes` whose action array is `["create"]` or contains `"delete"` —
anything Terraform would have to add, destroy or replace to make live GCP match
state. This outage produced 68 creates. Each address is labelled by whether
`resource_drift` corroborates it (an external change) or not (likely unapplied
config), but that label is advisory: the alert never depends on it, because the
plan JSON format does not guarantee remotely-deleted objects appear in
`resource_drift`.

### What it deliberately does NOT alert on

**Remote mutations that reconcile to an in-place `["update"]`.** If someone
widens a firewall rule by hand, the plan wants to update it back and this check
stays silent. That is a real gap, accepted knowingly.

The reason is the same one that caused this outage to hide. A plan against
healthy dev state carries **49 `resource_drift` entries**, and every single one
was verified to be provider normalization — `null → []`, `null → {}`, a
server-computed certificate `expire_time`, alert-policy `conditions` reordering.
Alerting on those would fire every day forever, which is precisely what the 13
uptime checks were doing while asserting `200` against an IAM-locked fleet. A
check that always fires is worthless. This one targets the signature that
actually happened: resources vanishing.

`["read"]` actions are tolerated explicitly — filtering on
`actions != ["no-op"]` sweeps in data-source refreshes, which is what
manufactured the phantom "13 duplicate secrets" blocker during recovery.

### If it fires

1. Read the issue — it lists resource addresses, not just a count.
2. Reproduce: `cd terraform && terraform plan -var-file=dev.tfvars`.
3. Addresses under "changed outside Terraform" mean something mutated GCP.
   Addresses under "not seen by refresh" usually mean config merged but never
   applied.
4. Do not blind-apply. Re-read the `-target` trap above: a targeted apply is not
   narrow, and Cloud NAT bills hourly.

### Operational prerequisites

The checker authenticates by Workload Identity Federation
(`terraform/drift-check.tf`, gated behind `enable_drift_check_reader`). The
tfvars supplied to CI **must set `enable_drift_check_reader = true`** to match
the applied state — otherwise the checker plans deletion of its own service
account on every run and alerts on itself forever. The workflow hard-fails with
that message rather than letting it become a daily mystery.
