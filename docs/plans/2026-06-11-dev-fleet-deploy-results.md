# Dev Fleet First Deploy — Results (2026-06-11)

The full 13-server MCP fleet is **live on Cloud Run** in
`open-agentic-advertising-dev`, **IAM-locked** (no public access), all services
healthy.

- **Apply:** `141 added, 1 changed, 0 destroyed`; all 13 services `Ready=True`
  (Cloud Run startup probe = HTTP GET `/health` → 200).
- **Images:** built via **Cloud Build** (native amd64) at SHA `92262b3d`,
  pushed to `europe-west2-docker.pkg.dev/open-agentic-advertising-dev/cesteral/*`.
- **Auth posture:** `allow_unauthenticated=false`, `authorized_invokers=[]` —
  **fully locked, nothing can invoke yet**. Verified: no invoker members; an
  unauthenticated `GET /health` returns **403**. Add
  `governance-invoker@cesteral-governance` to `authorized_invokers` once the
  governance identity stack (Phase A) is applied — additive, no redeploy
  semantics change.

## Service URLs

| Service | URL |
| --- | --- |
| amazon-dsp-mcp | https://amazon-dsp-mcp-6evyj7hdna-nw.a.run.app |
| cm360-mcp | https://cm360-mcp-6evyj7hdna-nw.a.run.app |
| dbm-mcp | https://dbm-mcp-6evyj7hdna-nw.a.run.app |
| dv360-mcp | https://dv360-mcp-6evyj7hdna-nw.a.run.app |
| gads-mcp | https://gads-mcp-6evyj7hdna-nw.a.run.app |
| linkedin-mcp | https://linkedin-mcp-6evyj7hdna-nw.a.run.app |
| meta-mcp | https://meta-mcp-6evyj7hdna-nw.a.run.app |
| msads-mcp | https://msads-mcp-6evyj7hdna-nw.a.run.app |
| pinterest-mcp | https://pinterest-mcp-6evyj7hdna-nw.a.run.app |
| sa360-mcp | https://sa360-mcp-6evyj7hdna-nw.a.run.app |
| snapchat-mcp | https://snapchat-mcp-6evyj7hdna-nw.a.run.app |
| tiktok-mcp | https://tiktok-mcp-6evyj7hdna-nw.a.run.app |
| ttd-mcp | https://ttd-mcp-6evyj7hdna-nw.a.run.app |

(All `*-6evyj7hdna-nw.a.run.app` — the dev fleet's stable Cloud Run suffix. These
are the origins for `FLEET_INVOKER_ALLOWED_ORIGINS` in the governance app.)

## Fixes that this first deploy shook out (all committed on `deploy/dev-first-rollout`)

1. `pnpm 10` broke `pnpm deploy` → scoped `--config.inject-workspace-packages=true` (`5e0dd8f8`).
2. Missing `.dockerignore` (was gitignored) → committed real one; context GBs→772B (`5e0dd8f8`).
3. `MCP_TRANSPORT_TYPE` → `MCP_TRANSPORT_MODE` (terraform env name) (`4f51051b`).
4. Host bind: `getDefaultHost()` honors `MCP_HTTP_HOST` so dev Cloud Run binds `0.0.0.0` (`4f51051b`).
5. `deploy.sh` images → `--platform linux/amd64` (Cloud Run arch) (`92262b3d`).
6. `deploy.sh` health gate → Cloud Run readiness check (no invoker token; works IAM-locked).
7. Cloud Build compute SA needed `roles/cloudbuild.builds.builder` (granted; should be codified in `init-gcp-project.sh`).

## Constraints discovered

- **Org Domain Restricted Sharing** (`iam.allowedPolicyMemberDomains`) forbids
  `allUsers` → `allow_unauthenticated=true` is impossible; the fleet must be
  IAM-locked. (This is the intended production posture.)
- Cloud Build local builds on Apple Silicon need `--platform linux/amd64`
  (emulated, slow); **Cloud Build native amd64** is the path (used here).

## Follow-ups

- Add `governance-invoker` to `authorized_invokers` after governance Phase A.
- Codify the Cloud Build compute-SA grant + the `--platform`/health-check fixes
  for prod (`open-agentic-advertising-prod`).
- Decision-token warn-mode logging not yet observable (no invoker traffic yet);
  verify once governance invocation is wired.
