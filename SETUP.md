# Cesteral - GitHub & Cloud Build Setup

## Repository Setup

This project uses **Git for version control** and **Google Cloud Build** for CI/CD deployment.

### Quick Start

```bash
# 1. Initialize repository (already done)
git init

# 2. Add all files
git add .

# 3. Create initial commit
git commit -m "Initial commit: Cesteral MCP Server"

# 4. Create GitHub repository (via GitHub CLI or web interface)
gh repo create YOUR_ORG/YOUR_REPO --private --source=. --remote=origin

# 5. Push to GitHub
git push -u origin main
```

## CI/CD Architecture

```
GitHub Repository
    ↓ (push to main/dev)
Cloud Build Trigger (automatic)
    ↓
cloudbuild.yaml execution:
    1. Build Docker images for all 13 MCP servers
    2. Push to Artifact Registry
    3. Run Terraform
    4. Deploy to Cloud Run
    5. Health check
```

## File Purposes

| File | Purpose | Used By |
|------|---------|---------|
| `.gitignore` | Controls version control (what goes into Git) | Git/GitHub |
| `.gcloudignore` | Controls deployment (what uploads to GCP) | Cloud Build |
| `cloudbuild.yaml` | Automated CI/CD pipeline | Cloud Build triggers |
| `cloudbuild-manual.yaml` | Manual build/push only (no Terraform) | Manual `gcloud builds submit` |

**Important**: `.gitignore` and `.gcloudignore` serve DIFFERENT purposes and are both needed:
- Git needs source code, tests, Terraform configs for version control
- Cloud Build only needs what's required for deployment (excludes tests, dev files)

## Setting Up Cloud Build Triggers

### Prerequisites

1. **Install GitHub App** (one-time setup):
   ```bash
   # In GCP Console:
   # Cloud Build → Triggers → Connect Repository → GitHub (Cloud Build GitHub App)
   # Authenticate and select your GitHub organization
   ```

2. **Create Build Triggers**:

   **Production Trigger** (main branch):
   ```bash
   gcloud builds triggers create github \
     --name="YOUR_PROJECT-prod-deploy" \
     --repo-name="YOUR_REPO" \
     --repo-owner="YOUR_GITHUB_ORG" \
     --branch-pattern="^main$" \
     --build-config="cloudbuild.yaml" \
     --substitutions="_ENVIRONMENT=prod,_REGION=europe-west2"
   ```

   **Development Trigger** (dev branch):
   ```bash
   gcloud builds triggers create github \
     --name="YOUR_PROJECT-dev-deploy" \
     --repo-name="YOUR_REPO" \
     --repo-owner="YOUR_GITHUB_ORG" \
     --branch-pattern="^dev$" \
     --build-config="cloudbuild.yaml" \
     --substitutions="_ENVIRONMENT=dev,_REGION=europe-west2"
   ```

### Branch Strategy

```
main     → Production deployment (auto-deploy on push)
dev      → Development deployment (auto-deploy on push)
feature/* → No auto-deploy (manual testing only)
```

## Manual Deployments

For testing or emergency deployments without committing to GitHub:

```bash
# Build and push only (no deployment)
gcloud builds submit \
  --config=cloudbuild-manual.yaml \
  --substitutions=_ENVIRONMENT=dev

# Full deployment (build + Terraform)
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=dev
```

## Workflow Examples

### Normal Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/new-validation

# 2. Make changes and commit
git add .
git commit -m "Add campaign name validation"

# 3. Push to GitHub
git push origin feature/new-validation

# 4. Create Pull Request on GitHub
gh pr create --title "Add campaign name validation" --base dev

# 5. After review, merge to dev
# → Cloud Build automatically deploys to dev environment

# 6. Test in dev, then merge to main
# → Cloud Build automatically deploys to production
```

### Hotfix Workflow

```bash
# 1. Create hotfix branch from main
git checkout main
git checkout -b hotfix/critical-bug

# 2. Fix and commit
git add .
git commit -m "Fix critical authentication bug"

# 3. Manual test deploy
gcloud builds submit --config=cloudbuild.yaml --substitutions=_ENVIRONMENT=dev

# 4. If successful, merge to main
git checkout main
git merge hotfix/critical-bug
git push origin main
# → Cloud Build automatically deploys to production
```

## Monitoring Builds

```bash
# List recent builds
gcloud builds list --limit=10

# View build details
gcloud builds describe BUILD_ID

# Stream build logs
gcloud builds log BUILD_ID --stream

# View in console
# https://console.cloud.google.com/cloud-build/builds
```

## Troubleshooting

### Build fails with "permission denied"
- Ensure Cloud Build service account has necessary IAM roles:
  - `roles/run.admin` (Cloud Run)
  - `roles/iam.serviceAccountUser` (Service Account)
  - `roles/artifactregistry.writer` (Artifact Registry)

### Terraform state locked
```bash
# Force unlock (use with caution)
cd terraform
terraform force-unlock LOCK_ID
```

### Wrong files deployed to Cloud Run
- Check `.gcloudignore` - it controls what uploads to GCP
- Note: `.gitignore` controls Git, not Cloud Build

## Security Notes

- **Never commit** service account keys (`.json` files)
- **Never commit** `.env` files with real secrets
- Use Secret Manager for production secrets
- Review `.gitignore` before first commit
- Cloud Build uses Workload Identity, not service account keys

## Next Steps

1. Create GitHub repository
2. Push code to GitHub
3. Set up Cloud Build triggers
4. Create Terraform backend configs (`terraform/backend-*.conf`)
5. Create Terraform variable files (`terraform/*.tfvars`)
6. Test deployment to your dev environment
