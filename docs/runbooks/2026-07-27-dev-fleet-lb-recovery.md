# Runbook: recover the dev fleet load balancer (mcp.cesteral.com)

**Status:** not started — diagnosis only, no apply performed
**Date:** 2026-07-27
**Project:** `open-agentic-advertising-dev`

## What is actually broken

The billing lapse on `open-agentic-advertising-dev` caused GCP to reclaim the
global load balancer. The Cloud Run services survived; the fronting layer did not.

| component                             | GCP reality                  | Terraform state      |
| ------------------------------------- | ---------------------------- | -------------------- |
| 13 Cloud Run services                 | present                      | in state, consistent |
| `google_compute_global_address.fleet` | **gone**                     | still in state       |
| global forwarding rules (http/https)  | **gone**                     | still in state       |
| backend services (13)                 | **gone**                     | still in state       |
| managed SSL certificate               | **gone**                     | still in state       |
| DNS `mcp.cesteral.com`                | resolves to `34.149.102.189` | —                    |

`34.149.102.189` no longer exists, so the domain fails at TLS connect. A
`terraform plan` refresh correctly detects all of this: 35 `fleet_lb` resources
sit in state and plan as "will be created".

## What is NOT broken

**The 403s from Cloud Run are correct and intentional — do not "fix" them.**

All 13 services are bound to exactly one invoker:

```
serviceAccount:governance-invoker@cesteral-governance.iam.gserviceaccount.com
```

`terraform/dev.tfvars` sets `allow_unauthenticated = false` deliberately, because
the org policy (Domain Restricted Sharing / `iam.allowedPolicyMemberDomains`)
forbids `allUsers` outright — an apply with `allow_unauthenticated = true` fails
with "do not belong to a permitted customer". This is the documented production
posture and the completed governance Phase D IAM-lock cutover.

So an anonymous `curl` against any service, or against `mcp.cesteral.com` once it
is back, **should** return 403. That is the system working. Health verification
uses Cloud Run readiness via `gcloud run services describe`, not an external curl,
precisely so it works with no invoker token.

The real impact of the missing LB is therefore **not** public access — it is that
the governance layer's path to the dev fleet is severed, including the
`custom_audiences` binding that ID tokens are minted against.

## Recovery sequence

Expect a new IP. `google_compute_global_address.fleet` is gone in GCP, so it will
be recreated and will almost certainly **not** get `34.149.102.189` back. Plan for
a DNS change; do not assume the old address returns.

### 1. Authenticate

ADC consent currently fails for the cloud-platform scope, so use the CLI token:

```bash
gcloud auth login daniel@cesteral.com
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token --account=daniel@cesteral.com)
cd terraform
terraform init -backend-config=backend-dev.conf -reconfigure
```

### 2. Confirm the blast radius before applying

The dev state currently plans **43 changes unrelated to the jti store**, most of
which are this LB module. Review the full plan before any untargeted apply:

```bash
terraform plan -var-file=dev.tfvars -out=/tmp/dev.plan
terraform show /tmp/dev.plan | grep -E "will be (created|destroyed|updated)"
```

Anything outside `module.fleet_lb` that plans as destroyed or replaced deserves
scrutiny — it is not part of this recovery.

### 3. Apply the LB module only

Targeted apply keeps the recovery scoped and avoids collateral changes:

```bash
terraform apply -var-file=dev.tfvars -target=module.fleet_lb
```

### 4. Capture the new IP

```bash
terraform output fleet_lb_ip
```

### 5. Update DNS

Point `mcp.cesteral.com` A record at the new IP. Until this propagates, the
managed certificate cannot provision — Google validates domain ownership by
resolving the record to the LB.

### 6. Wait for the managed certificate

```bash
gcloud compute ssl-certificates describe <cert-name> \
  --global --project=open-agentic-advertising-dev \
  --format='value(managed.status,managed.domainStatus)'
```

`PROVISIONING` → `ACTIVE` typically takes 15–60 minutes after DNS resolves, and
can take longer. The domain serves TLS only once this is `ACTIVE`.

### 7. Verify

```bash
# Expect HTTP 403 — anonymous traffic is correctly rejected.
curl -sS -o /dev/null -w '%{http_code}\n' https://mcp.cesteral.com/dv360/health

# Expect success — the governance SA is the only authorized invoker.
# Run from a context holding governance-invoker credentials.
```

A 403 here is the success condition for the LB itself; it proves TLS terminated
and the request reached a backend that then applied IAM. A TLS error or 502 means
the recovery is incomplete.

## Follow-ups this exposes

- **The governance repo may pin the old IP or the custom audience.** Check
  `cesteral-intelligence` for a hardcoded `34.149.102.189` or a `custom_audiences`
  value tied to the destroyed LB before declaring the integration healthy.
- **Nothing detected this.** The LB vanished and the only signal was a Terraform
  plan run for an unrelated feature. A synthetic check against `mcp.cesteral.com`
  (even one asserting 403 rather than 200) would have caught it immediately.
- **Billing alerting.** The root cause was a closed billing account; the first
  symptom surfaced was `UserProjectAccountProblem` on the Terraform state bucket.
