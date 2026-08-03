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
- **Terraform state drift is not monitored.** State claimed 35 LB resources and 8
  networking resources that no longer existed. A scheduled `terraform plan` that
  alerts on unexpected drift would have caught this on day one.
