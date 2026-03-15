# Deployment Readiness Checklist

Use this checklist before promoting any environment.

## Environment Baseline

- Confirm the target GCP project exists and matches the environment mapping:
  - `dev` -> `open-agentic-advertising-dev`
  - `prod` -> `open-agentic-advertising-prod`
- Confirm the Terraform backend bucket exists for the environment.
- Confirm Artifact Registry repository `cesteral` exists in `europe-west2`.
- Confirm required APIs are enabled: Cloud Run, Secret Manager, Artifact Registry, Compute Engine, VPC Access, Logging, Monitoring, Trace, Cloud Build, IAM, Resource Manager, Storage.

## Per-Service Rollout

For each of `dbm-mcp`, `dv360-mcp`, `ttd-mcp`, `gads-mcp`, `meta-mcp`, `linkedin-mcp`, `tiktok-mcp`, `cm360-mcp`, `sa360-mcp`, `pinterest-mcp`, `snapchat-mcp`, `amazon-dsp-mcp`, `msads-mcp`:

- Build the Docker image successfully.
- Push the image to Artifact Registry with both commit SHA and environment tags.
- Confirm all required Secret Manager values exist for that service.
- Confirm the Cloud Run revision starts and returns `200` on `/health`.
- Run a smoke test against the MCP HTTP transport with the expected auth mode.
- Check Cloud Logging for startup errors and secret resolution errors.
- Confirm rollback is possible to the previous healthy revision.

## Promotion Gate

- `pnpm run build`
- `pnpm run typecheck`
- `pnpm run test`
- `terraform validate`
- `tflint --recursive`
- Successful `terraform plan` review
- Successful post-deploy health checks for all 13 services
