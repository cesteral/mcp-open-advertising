# Environment Variables Guide

## Current Setup Analysis

### What We Have Now

1. **Root `.env.example`** - Monorepo-wide environment variables template
2. **Root `.env`** (gitignored) - Actual local environment variables
3. **Individual package configs** - Each package uses `dotenv` to load from root

### How It Works

```
cesteral-mcp-servers/
├── .env.example          # Template (committed)
├── .env                  # Local values (gitignored)
└── packages/
    ├── dv360-mcp/
    │   └── src/config/index.ts  # Calls dotenv.config() → loads from ROOT .env
    ├── dbm-mcp/
    │   └── src/config/index.ts  # Calls dotenv.config() → loads from ROOT .env
    ├── ttd-mcp/
    │   └── src/config/index.ts  # Calls dotenv.config() → loads from ROOT .env
    ├── gads-mcp/
    │   └── src/config/index.ts  # Calls dotenv.config() → loads from ROOT .env
    └── meta-mcp/
        └── src/config/index.ts  # Calls dotenv.config() → loads from ROOT .env
```

**How `dotenv.config()` works:**
- Searches for `.env` file starting from current directory
- Walks UP the directory tree until it finds `.env`
- In a monorepo, it finds the **root `.env`**
- All packages share the same environment variables

---

## Recommendation: Keep It Simple ✅

**TL;DR: Your current setup is perfect. Keep it as-is.**

### Why Root-Level `.env` is Best for Monorepos

#### ✅ **Advantages**

1. **Single Source of Truth**
   - All environment variables in one place
   - No duplication across packages
   - Easy to see all configuration at once

2. **Shared Variables**
   - Common vars (JWT_SECRET, GCP_PROJECT_ID) defined once
   - All packages access the same values
   - Consistent configuration across services

3. **Simpler Development**
   - Only one file to manage locally
   - Run any package with same environment
   - No confusion about which `.env` is loaded

4. **Production Parity**
   - Production (Cloud Run) sets environment variables at deployment level
   - Same pattern as root `.env` (one set of variables for all services)
   - Local development mirrors production

#### ❌ **Why Package-Level `.env` is Worse**

1. **Duplication**
   - Same JWT_SECRET in 3 different files
   - Easy to get out of sync
   - Hard to manage secrets

2. **Confusion**
   - Which `.env` is being loaded?
   - Need to maintain multiple files
   - Different values in different packages can cause bugs

3. **Not How Production Works**
   - In Cloud Run, all packages get same environment
   - Package-level `.env` doesn't match production pattern

---

## Recommended Structure (Current Setup)

```
cesteral-mcp-servers/
├── .env.example          ← COMMITTED: Template with all variables
├── .env                  ← GITIGNORED: Your local values
├── .gitignore            ← Includes .env, .env.*, !.env.example
└── packages/
    ├── dv360-mcp/
    │   ├── .env.example  ← OPTIONAL: Package-specific docs only
    │   └── src/config/index.ts
    ├── dbm-mcp/
    ├── ttd-mcp/
    ├── gads-mcp/
    └── meta-mcp/
```

### Root `.env.example` (Template)

Keep your current root `.env.example` with ALL variables for ALL packages:

```bash
# =============================================================================
# CESTERAL MCP MONOREPO - ENVIRONMENT VARIABLES
# =============================================================================

# Node Environment
NODE_ENV=development

# GCP Configuration
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1

# =============================================================================
# SHARED CONFIGURATION (All Packages)
# =============================================================================

# Authentication
JWT_SECRET=your-jwt-secret-here
MCP_AUTH_MODE=none                              # none | jwt | google-headers | gads-headers | ttd-token | meta-bearer
MCP_AUTH_SECRET_KEY=

# MCP Session Management
MCP_SESSION_MODE=auto                           # auto | stateless | stateful
MCP_STATEFUL_SESSION_TIMEOUT_MS=3600000         # 1 hour
MCP_ALLOWED_ORIGINS=*                           # CSV of allowed origins

# Logging
LOG_LEVEL=info
MCP_LOG_LEVEL=debug

# OpenTelemetry (All Services)
OTEL_ENABLED=false
OTEL_SERVICE_NAME=ttd-mcp
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=

# =============================================================================
# PACKAGE-SPECIFIC CONFIGURATION
# =============================================================================

# ---------- dbm-mcp (Reporting Server) ----------
DBM_MCP_PORT=3001
DBM_MCP_HOST=0.0.0.0

# BigQuery
BIGQUERY_DATASET_ID=cesteral
BIGQUERY_LOCATION=US

# ---------- dv360-mcp (Management Server) ----------
DV360_MCP_PORT=3002
DV360_MCP_HOST=0.0.0.0

# DV360 API
DV360_API_BASE_URL=https://displayvideo.googleapis.com/v4
DV360_SERVICE_ACCOUNT_JSON=
DV360_RATE_LIMIT_PER_MINUTE=60

# MCP Session
MCP_SESSION_MODE=auto
MCP_STATEFUL_SESSION_TIMEOUT_MS=3600000
MCP_ALLOWED_ORIGINS=*

# ---------- ttd-mcp (The Trade Desk Server) ----------
TTD_MCP_PORT=3003
TTD_MCP_HOST=0.0.0.0

# TTD API Configuration
TTD_API_TOKEN=your-ttd-api-token
TTD_API_BASE_URL=https://api.thetradedesk.com/v3
TTD_RATE_LIMIT_PER_MINUTE=60

# ---------- gads-mcp (Google Ads Server) ----------
GADS_MCP_PORT=3004
GADS_MCP_HOST=0.0.0.0

# Google Ads API Configuration
GADS_DEVELOPER_TOKEN=your-developer-token
GADS_CLIENT_ID=your-oauth-client-id
GADS_CLIENT_SECRET=your-oauth-client-secret
GADS_REFRESH_TOKEN=your-oauth-refresh-token
GADS_LOGIN_CUSTOMER_ID=                         # Optional: MCC login customer ID (no dashes)
GADS_API_BASE_URL=https://googleads.googleapis.com/v23
GADS_RATE_LIMIT_PER_MINUTE=100

# ---------- meta-mcp (Meta Ads Server) ----------
META_MCP_PORT=3005
META_MCP_HOST=0.0.0.0

# Meta API Configuration
META_ACCESS_TOKEN=your-meta-access-token
META_API_BASE_URL=https://graph.facebook.com/v25.0
META_RATE_LIMIT_PER_MINUTE=60
```

### Local `.env` (Your Actual Values)

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
# Edit .env with your actual values
```

### Package-Level `.env.example` (Optional Documentation)

If you want package-specific documentation, create lightweight `.env.example` files:

**`packages/dv360-mcp/.env.example`:**
```bash
# DV360 MCP Server - Environment Variables
# See root .env.example for full configuration

# Required Variables for dv360-mcp:
# - DV360_MCP_PORT (default: 3002)
# - DV360_SERVICE_ACCOUNT_JSON (required for API access)
# - OTEL_ENABLED (default: false)
# - MCP_AUTH_MODE (default: none)

# For full list, see: ../../.env.example
```

**Benefits of package-level `.env.example`:**
- Quick reference for developers working on one package
- Documents which variables are relevant to this package
- Doesn't duplicate values, just references root

---

## How to Use This Setup

### Local Development

**1. First Time Setup:**
```bash
# Clone repo
git clone https://github.com/your-org/cesteral-mcp-servers.git
cd cesteral-mcp-servers

# Create local .env from template
cp .env.example .env

# Edit .env with your local values
vim .env
```

**2. Run Any Package:**
```bash
# All packages automatically load root .env
cd packages/dv360-mcp
pnpm run dev:http
# ✓ Loads ../../.env automatically
```

**3. Override for Testing:**
```bash
# Temporarily override for one run
DV360_MCP_PORT=9999 pnpm run dev:http

# Or use .env.local (if you add it to dotenv config)
```

### CI/CD (GitHub Actions, etc.)

Set environment variables as GitHub Secrets:

```yaml
# .github/workflows/deploy.yml
env:
  NODE_ENV: production
  DV360_SERVICE_ACCOUNT_JSON: ${{ secrets.DV360_SERVICE_ACCOUNT_JSON }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

### Production (Cloud Run)

Set environment variables per service in `terraform/`:

```hcl
# terraform/dv360-mcp.tf
resource "google_cloud_run_service" "dv360_mcp" {
  template {
    spec {
      containers {
        env {
          name  = "DV360_MCP_PORT"
          value = "8080"
        }
        env {
          name  = "DV360_SERVICE_ACCOUNT_JSON"
          value_from {
            secret_key_ref {
              name = "dv360-service-account"
              key  = "latest"
            }
          }
        }
        env {
          name  = "OTEL_ENABLED"
          value = "true"
        }
      }
    }
  }
}
```

---

## Advanced: Package-Specific Overrides (If Needed Later)

If you ever need package-specific environment files, use `dotenv` path option:

**`packages/dv360-mcp/src/config/index.ts`:**
```typescript
import { config } from "dotenv";
import path from "path";

// Load root .env first (shared variables)
config();

// Then optionally load package-specific .env (overrides)
config({ path: path.join(__dirname, "../../.env.dv360") });
```

This gives you:
1. Shared variables from root `.env`
2. Package-specific overrides from `.env.dv360`

**But:** Only do this if you have a specific need. Keep it simple until then.

---

## Common Patterns

### Pattern 1: Development + Staging + Production

```bash
# Root .env (local development)
.env

# Root .env.staging (staging values)
.env.staging

# Root .env.production (production values) - NOT COMMITTED
.env.production
```

Load different files based on NODE_ENV:

```typescript
import { config } from "dotenv";

const envFile = process.env.NODE_ENV === "production"
  ? ".env.production"
  : process.env.NODE_ENV === "staging"
  ? ".env.staging"
  : ".env";

config({ path: envFile });
```

### Pattern 2: Secrets from Secret Manager

Don't put production secrets in `.env` files. Load from GCP Secret Manager:

```typescript
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

async function loadSecrets() {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: "projects/PROJECT_ID/secrets/dv360-service-account/versions/latest",
  });

  process.env.DV360_SERVICE_ACCOUNT_JSON = version.payload?.data?.toString();
}
```

### Pattern 3: Required vs Optional Variables

Document which variables are required in your `.env.example`:

```bash
# ===== REQUIRED VARIABLES =====
DV360_SERVICE_ACCOUNT_JSON=        # REQUIRED: GCP service account JSON
JWT_SECRET=                        # REQUIRED: JWT signing secret (32+ chars)

# ===== OPTIONAL VARIABLES =====
DV360_MCP_PORT=3002               # Optional: Default 3002
OTEL_ENABLED=false                # Optional: Default false
```

---

## Troubleshooting

### "Config not loading" / "Undefined environment variable"

**Check dotenv is loading:**
```typescript
// src/config/index.ts
import { config } from "dotenv";

const result = config();
console.log("Dotenv result:", result); // Should show { parsed: {...} }
console.log("DV360_MCP_PORT:", process.env.DV360_MCP_PORT);
```

**Check .env file location:**
```bash
# From package directory
pwd
# /Users/you/project/packages/dv360-mcp

ls ../../.env
# Should exist
```

**Check .env is not in .gitignore by mistake:**
```bash
git check-ignore .env
# Should return nothing if .env is correctly gitignored
```

### "Different packages see different values"

This shouldn't happen with root `.env`. If it does:
1. Check you're not loading package-specific `.env` files
2. Verify `dotenv.config()` is called before reading `process.env`
3. Restart dev server (env changes require restart)

---

## Summary & Recommendation

### ✅ Keep Your Current Setup

Your current structure is **perfect** for a monorepo:

1. **Root `.env.example`** - Committed template with all variables
2. **Root `.env`** - Gitignored local values
3. **All packages** - Load from root via `dotenv.config()`

### Optional Enhancements

1. **Add package-level `.env.example`** for documentation (doesn't duplicate values)
2. **Document required vs optional** variables in `.env.example`
3. **Use Secret Manager** for production secrets (not `.env` files)

### Don't Do This

- ❌ Don't create package-level `.env` files with duplicate values
- ❌ Don't commit `.env` with secrets
- ❌ Don't use different `.env` files for different packages

---

## Updated `.env.example` for dv360-mcp

Based on your current configuration, here's what the root `.env.example` should include for dv360-mcp:

```bash
# =============================================================================
# DV360-MCP SPECIFIC VARIABLES
# =============================================================================

# Server Configuration
DV360_MCP_PORT=3002
DV360_MCP_HOST=0.0.0.0
NODE_ENV=development

# MCP Authentication
MCP_AUTH_MODE=none                           # none | jwt | google-headers | ttd-token
MCP_AUTH_SECRET_KEY=                         # Required if MCP_AUTH_MODE=jwt (32+ chars)

# MCP Session Management
MCP_SESSION_MODE=auto                        # auto | stateless | stateful
MCP_STATEFUL_SESSION_TIMEOUT_MS=3600000     # 1 hour
MCP_ALLOWED_ORIGINS=*                        # CSV of allowed origins

# DV360 API Configuration
DV360_API_BASE_URL=https://displayvideo.googleapis.com/v4
DV360_SERVICE_ACCOUNT_JSON=                  # REQUIRED: Base64 or file path
DV360_RATE_LIMIT_PER_MINUTE=60

# Logging
LOG_LEVEL=info
MCP_LOG_LEVEL=debug

# OpenTelemetry
OTEL_ENABLED=false
OTEL_SERVICE_NAME=dv360-mcp
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=

# Google Cloud (Optional - for Secret Manager)
SERVICE_ACCOUNT_SECRET_ID=
```

Your current setup already follows best practices! 🎉
