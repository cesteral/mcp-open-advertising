# BSL 1.1 Public Readiness — MCP Servers

**Date:** February 27, 2026
**Status:** Planning
**Addresses triggers:** #4 (READMEs polished) + preparation checklist items

---

**Goal:** Complete all remaining work in `cesteral-mcp-servers` needed before the repository can go public under BSL 1.1. This covers deploying the fifth server (meta-mcp), committing pending infrastructure fixes, auditing for sensitive artifacts, polishing documentation for an external audience, and prepping MCP registry listings.

**Dependencies:** None of these tasks depend on `cesteral-intelligence`. They can proceed in parallel with the intelligence work.

---

### Task 1: Commit pending Terraform fixes

The working tree has uncommitted changes across 5 Terraform files that fix the error rate alert (adds a denominator filter for proper percentage calculation) and add variable validation blocks. These should be committed before further infra work.

**Files:**
- `terraform/dev.tfvars`
- `terraform/staging.tfvars`
- `terraform/prod.tfvars`
- `terraform/variables.tf`
- `terraform/modules/monitoring/variables.tf`
- `terraform/modules/monitoring/main.tf`

**Decision:** The uncommitted changes also removed `meta-mcp` from `monitoring_services` in all tfvars (it was added prematurely before the service exists in Terraform). Commit these removals as part of this task — meta-mcp will be re-added in Task 2 when the full module is wired up.

---

### Task 2: Add meta-mcp to Terraform

meta-mcp server code is complete (committed at `4abd96f`) but has no Terraform module instance. Add a fifth `module "meta_mcp"` block to `terraform/main.tf` following the existing pattern (dbm, dv360, ttd, gads).

**Files:**
- `terraform/main.tf` — add `module "meta_mcp"` block
- `terraform/variables.tf` — add `meta_mcp_image`, `meta_secret_names`, `meta_secret_env_vars` variables
- `terraform/dev.tfvars` — add `meta_mcp_image`, re-add meta-mcp to `monitoring_services`
- `terraform/staging.tfvars` — same
- `terraform/prod.tfvars` — same

**Key decisions:**
- Secret names: `cesteral-jwt-secret-key` (shared) + `cesteral-meta-access-token` (platform-specific)
- Secret env vars: `MCP_AUTH_SECRET_KEY` → jwt key, `META_ACCESS_TOKEN` → platform token
- No scheduler jobs (like dv360, ttd, gads)
- Add `module.meta_mcp` to the monitoring module's `depends_on` list
- Monitoring service URL will be placeholder initially — update post-deploy (Task 5)

---

### Task 3: Add meta-mcp to CI/CD pipeline

Both Cloud Build configs build/deploy only 4 servers. Add meta-mcp as the fifth.

**Files:**
- `cloudbuild.yaml` — add Step 2e (build), Step 3e (push), add to terraform plan `-var`, health check loop, and `images` list
- `cloudbuild-manual.yaml` — add build step 1e, push step 2e, and `images` list

**Pattern:** Identical to the gads-mcp entries with `SERVER_NAME=meta-mcp`. Build step waits for `test`, push waits for its build.

---

### Task 4: Audit repository for sensitive artifacts

Systematic sweep for hardcoded credentials, internal URLs, debug artifacts, and anything inappropriate for a public repo. This is a preparation checklist item from the licensing strategy.

**Scope:**
- Grep for patterns: API keys, tokens, passwords, secrets, internal hostnames, `TODO` comments with internal context, `.env` files, debug `console.log` statements
- Check `.gitignore` covers all sensitive patterns
- Review `packages/*/src/config/` files for hardcoded values
- Review test files for real credentials or internal URLs
- Verify no `.env` or credential files are tracked

**Output:** List of findings to fix, or confirmation that the repo is clean.

---

### Task 5: Polish per-package READMEs for external audience

The root README was polished in commit `c2363b5`. The 6 package READMEs need review and update for an external audience (someone discovering these on GitHub).

**Files:**
- `packages/shared/README.md`
- `packages/dbm-mcp/README.md`
- `packages/dv360-mcp/README.md`
- `packages/ttd-mcp/README.md`
- `packages/gads-mcp/README.md`
- `packages/meta-mcp/README.md`

**Each README should include:**
- What the server does (1-2 sentences)
- Which platform API it wraps and version
- List of MCP tools exposed (table: tool name, description)
- Auth modes supported
- Environment variables needed
- Quick start (local dev)
- Link to root README for full architecture context
- BSL 1.1 license notice

---

### Task 6: Prep MCP registry draft listings

Draft listing content for the three major MCP registries. Don't publish yet — these are ready-to-submit when Trigger #2 (landing page) is met.

**Registries:**
- Smithery (smithery.ai)
- mcp.so
- Glama (glama.ai)

**Per-listing content:**
- Name, description, category (Advertising / Marketing)
- Tool count and platform coverage summary
- Auth requirements
- Self-host vs hosted options
- Link to GitHub repo (once public) and landing page (once built)
- Screenshots / demo (once landing page exists)

**Output:** A single markdown file `docs/registry-listings-draft.md` with all three drafts.

---

### Task 7 (Post-deploy): Update monitoring service URLs

After the first successful `terraform apply` for each environment, replace the placeholder URLs in tfvars with real Cloud Run URLs.

**Command to get URLs:**
```bash
gcloud run services list --region=europe-west2 --format="table(name,URL)"
```

**Files:** `terraform/dev.tfvars`, `terraform/staging.tfvars`, `terraform/prod.tfvars`

This is a manual post-deployment step, not automatable in advance.

---

### Verification

- `pnpm run build` passes (all 6 packages)
- `pnpm run typecheck` passes
- `terraform validate` passes in `terraform/` directory
- `terraform plan -var-file=dev.tfvars` runs without errors (with placeholder images)
- All 6 package READMEs render correctly on GitHub
- No sensitive artifacts found in audit (Task 4)
