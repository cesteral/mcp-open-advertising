# DV360 Service Account Setup Guide

This guide walks you through creating and configuring a Google Cloud service account for DV360 API access.

## Overview

The dv360-mcp server uses OAuth2 service account authentication to access the Display & Video 360 API. Service accounts provide:

- **Non-interactive authentication** - No user login required
- **API access control** - Fine-grained permissions via scopes
- **Security** - Credentials managed separately from code
- **Scalability** - Same credentials work across all server instances

## Prerequisites

- Google Cloud Project with billing enabled
- DV360 account access (Partner or Advertiser level)
- Permissions to create service accounts in GCP
- `gcloud` CLI installed (optional, for command-line setup)

## Step 1: Create Google Cloud Project

If you don't have a GCP project yet:

### Via Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name (e.g., `bidshifter-dv360`)
4. Click **Create**

### Via CLI

```bash
gcloud projects create bidshifter-dv360 --name="BidShifter DV360 Integration"
gcloud config set project bidshifter-dv360
```

## Step 2: Enable Display & Video 360 API

### Via Console

1. Navigate to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Display & Video 360 API"
3. Click on **Display & Video 360 API**
4. Click **Enable**

### Via CLI

```bash
gcloud services enable displayvideo.googleapis.com
```

**Note**: The API may take a few minutes to fully enable.

## Step 3: Create Service Account

### Via Console

1. Go to [IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click **Create Service Account**
3. Fill in details:
   - **Name**: `dv360-mcp-service-account`
   - **Description**: `Service account for dv360-mcp server to access DV360 API`
4. Click **Create and Continue**
5. **Grant this service account access to project** (optional):
   - For basic setup, you can skip this step
   - For production, consider adding roles like `Logs Writer` for Cloud Logging
6. Click **Continue**
7. **Grant users access to this service account** (optional):
   - Skip for now
8. Click **Done**

### Via CLI

```bash
gcloud iam service-accounts create dv360-mcp-service-account \
  --display-name="DV360 MCP Service Account" \
  --description="Service account for dv360-mcp server to access DV360 API"
```

## Step 4: Create and Download Service Account Key

### Via Console

1. In the Service Accounts list, find your newly created account
2. Click the **⋮** (three dots) → **Manage keys**
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create**
6. The JSON key file will download automatically (e.g., `bidshifter-dv360-abc123.json`)

**⚠️ Security Warning**: This file contains sensitive credentials. Store it securely and never commit to version control.

### Via CLI

```bash
gcloud iam service-accounts keys create ~/dv360-service-account-key.json \
  --iam-account=dv360-mcp-service-account@bidshifter-dv360.iam.gserviceaccount.com
```

## Step 5: Link Service Account to DV360

The service account needs explicit access to your DV360 account.

### Option A: Link at Partner Level (Recommended)

1. Go to [Display & Video 360](https://displayvideo.google.com/)
2. Navigate to **Settings** → **Basic details**
3. Scroll to **API Access**
4. Click **Add service account**
5. Enter your service account email:
   ```
   dv360-mcp-service-account@bidshifter-dv360.iam.gserviceaccount.com
   ```
6. Select access level:
   - **Read Only** - For reporting/querying only
   - **Read and Write** - For full CRUD operations (recommended for dv360-mcp)
7. Click **Add**

### Option B: Link at Advertiser Level

If you only need access to specific advertisers:

1. In DV360, navigate to the advertiser
2. Go to **Settings** → **Basic details**
3. Scroll to **API Access**
4. Follow the same process as Partner level

**Note**: You'll need to repeat this for each advertiser you want to access.

## Step 6: Configure dv360-mcp Server

You have two options for providing credentials to the server:

### Option A: Base64-Encoded Environment Variable (Recommended for Local Dev)

1. **Encode the JSON key file**:

   ```bash
   # macOS/Linux
   cat ~/dv360-service-account-key.json | base64

   # Output will be a long base64 string
   ```

2. **Add to `.env` file**:

   ```bash
   # packages/dv360-mcp/.env
   DV360_SERVICE_ACCOUNT_JSON=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6...
   ```

3. **Verify configuration**:

   ```bash
   cd packages/dv360-mcp
   pnpm run dev:http
   ```

   Check logs for successful authentication.

### Option B: GCP Secret Manager (Recommended for Production)

1. **Store service account key in Secret Manager**:

   ```bash
   # Create secret
   gcloud secrets create dv360-service-account \
     --data-file=~/dv360-service-account-key.json \
     --replication-policy=automatic
   ```

2. **Grant service account access to the secret** (for Cloud Run):

   ```bash
   # Get the Cloud Run service account email
   PROJECT_NUMBER=$(gcloud projects describe bidshifter-dv360 --format="value(projectNumber)")
   CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

   # Grant access
   gcloud secrets add-iam-policy-binding dv360-service-account \
     --member="serviceAccount:${CLOUD_RUN_SA}" \
     --role="roles/secretmanager.secretAccessor"
   ```

3. **Configure dv360-mcp to use Secret Manager**:

   ```bash
   # In Cloud Run environment variables
   SERVICE_ACCOUNT_SECRET_ID=projects/bidshifter-dv360/secrets/dv360-service-account/versions/latest
   ```

## Step 7: Verify Setup

### Test Authentication

Create a test script to verify credentials work:

```bash
# test-dv360-auth.sh
cd packages/dv360-mcp

# Start server
pnpm run dev:http &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
curl http://localhost:3002/health


kill $SERVER_PID
```

### Check Logs

Look for successful authentication in logs:

```bash
# Expected log entries:
# ✓ DV360Service initialized
# ✓ Successfully obtained OAuth2 token
# ✓ HTTP Server listening on port 3002
```

## Required API Scopes

The service account needs the following OAuth2 scope:

```
https://www.googleapis.com/auth/display-video
```

This scope provides full access to DV360 API. The dv360-mcp server will request this scope when authenticating.

**Note**: The scope is requested programmatically by the server - you don't need to manually configure it.

## Security Best Practices

### 1. Credential Storage

**DO**:

- ✅ Store JSON key file in secure location (e.g., `~/.gcp/keys/`)
- ✅ Use GCP Secret Manager for production deployments
- ✅ Base64 encode credentials in environment variables
- ✅ Set restrictive file permissions: `chmod 600 ~/dv360-service-account-key.json`

**DON'T**:

- ❌ Commit service account JSON to version control
- ❌ Share service account keys via email/chat
- ❌ Store unencrypted keys in CI/CD logs
- ❌ Use the same key across development and production

### 2. Access Control

- Grant minimum necessary permissions (read-only if possible)
- Link service account only to required advertisers (not entire partner)
- Rotate keys regularly (every 90 days recommended)
- Audit service account usage via GCP logs

### 3. Key Rotation

To rotate a compromised or expired key:

1. Create new key (Step 4)
2. Update dv360-mcp configuration with new key
3. Test that new key works
4. Delete old key in GCP Console:
   - Go to Service Account → **Keys**
   - Click **⋮** on old key → **Delete**

### 4. Monitoring

Enable logging to detect suspicious activity:

```bash
# In .env
LOG_LEVEL=info
OTEL_ENABLED=true
```

Monitor for:

- Failed authentication attempts
- Unusual API request patterns
- Rate limit violations

## Troubleshooting

### Error: "Service account not found"

**Cause**: Service account email is incorrect or doesn't exist.

**Solution**:

```bash
# List all service accounts
gcloud iam service-accounts list

# Verify email matches configuration
```

### Error: "API has not been used in project before"

**Cause**: DV360 API not enabled in GCP project.

**Solution**:

```bash
gcloud services enable displayvideo.googleapis.com

# Wait 2-3 minutes for API to fully activate
```

### Error: "Service account does not have access to this advertiser"

**Cause**: Service account not linked in DV360.

**Solution**:

- Follow Step 5 to link service account at Partner or Advertiser level
- Wait 5-10 minutes for permissions to propagate
- Verify correct access level (Read and Write vs Read Only)

### Error: "Invalid JWT: Token must be a short-lived token"

**Cause**: Service account JSON might be corrupted or improperly encoded.

**Solution**:

```bash
# Decode and validate JSON structure
echo $DV360_SERVICE_ACCOUNT_JSON | base64 -d | jq .

# Look for required fields: type, project_id, private_key_id, private_key, client_email
```

### Error: "Request had insufficient authentication scopes"

**Cause**: Service account linked with "Read Only" but server is attempting write operations.

**Solution**:

- In DV360, update service account access level to "Read and Write"
- Wait 5 minutes for permissions to sync

### Server starts but all API calls fail

**Possible causes**:

1. Service account JSON not properly base64 encoded
2. Service account not linked in DV360
3. DV360 API not enabled

**Debugging steps**:

```bash
# 1. Verify JSON structure
echo $DV360_SERVICE_ACCOUNT_JSON | base64 -d | jq .

# 2. Check API is enabled
gcloud services list --enabled | grep displayvideo

# 3. Test OAuth2 token generation manually
# (Use service account email and private key to create JWT assertion)
```

## Additional Resources

- [Google Cloud Service Accounts Documentation](https://cloud.google.com/iam/docs/service-accounts)
- [DV360 API Authentication Guide](https://developers.google.com/display-video/api/guides/authentication)
- [OAuth2 Service Account Flow](https://developers.google.com/identity/protocols/oauth2/service-account)
- [GCP Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)

## Support

For issues with:

- **GCP/Service Accounts**: Check [GCP Support](https://cloud.google.com/support)
- **DV360 API Access**: Contact your DV360 account manager
- **dv360-mcp server**: See main [README.md](../README.md) troubleshooting section

## Quick Reference

### Commands Cheat Sheet

```bash
# Create service account
gcloud iam service-accounts create dv360-mcp-service-account

# Enable DV360 API
gcloud services enable displayvideo.googleapis.com

# Create and download key
gcloud iam service-accounts keys create ~/dv360-key.json \
  --iam-account=dv360-mcp-service-account@PROJECT_ID.iam.gserviceaccount.com

# Base64 encode key
cat ~/dv360-key.json | base64

# Store in Secret Manager
gcloud secrets create dv360-service-account --data-file=~/dv360-key.json

# List service accounts
gcloud iam service-accounts list

# Delete old key
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=dv360-mcp-service-account@PROJECT_ID.iam.gserviceaccount.com
```

### Service Account Email Format

```
<service-account-name>@<project-id>.iam.gserviceaccount.com
```

Example:

```
dv360-mcp-service-account@bidshifter-dv360.iam.gserviceaccount.com
```

### Required DV360 Permissions

| Permission Level | Can Read | Can Create | Can Update | Can Delete |
| ---------------- | -------- | ---------- | ---------- | ---------- |
| Read Only        | ✅       | ❌         | ❌         | ❌         |
| Read and Write   | ✅       | ✅         | ✅         | ✅         |

For full dv360-mcp functionality, **Read and Write** access is required.
