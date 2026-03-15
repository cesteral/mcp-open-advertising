# Cesteral Repository Structure

## Overview

This repository contains the **open-source connector layer** for Cesteral: thirteen MCP servers plus shared runtime and deployment infrastructure.

The proprietary hosted product, `Cesteral Intelligence`, is intentionally **not** implemented in this repository. It sits above this connector layer and adds tenancy, managed credential configuration, orchestration, approvals, audit, and hosted operations.

See [architecture/oss-vs-intelligence-boundary.md](architecture/oss-vs-intelligence-boundary.md) for the canonical boundary.

## Repository Layout

```text
cesteral-mcp-servers/
├── packages/
│   ├── dbm-mcp/
│   ├── dv360-mcp/
│   ├── ttd-mcp/
│   ├── gads-mcp/
│   ├── meta-mcp/
│   ├── linkedin-mcp/
│   ├── tiktok-mcp/
│   ├── cm360-mcp/
│   ├── sa360-mcp/
│   ├── pinterest-mcp/
│   ├── snapchat-mcp/
│   ├── amazon-dsp-mcp/
│   ├── msads-mcp/
│   └── shared/
├── docs/
├── scripts/
├── terraform/
├── cloudbuild.yaml
├── cloudbuild-manual.yaml
└── README.md
```

## Packages

### MCP servers

The `packages/` directory contains 13 independently deployable MCP servers:

- `dbm-mcp`
- `dv360-mcp`
- `ttd-mcp`
- `gads-mcp`
- `meta-mcp`
- `linkedin-mcp`
- `tiktok-mcp`
- `cm360-mcp`
- `sa360-mcp`
- `pinterest-mcp`
- `snapchat-mcp`
- `amazon-dsp-mcp`
- `msads-mcp`

These are the open-source connectors that customers can self-host or that Cesteral can host as part of the commercial product.

### Shared runtime

`packages/shared/` contains reusable infrastructure used by the server packages:

- auth strategies and adapters
- MCP HTTP transport helpers
- telemetry and logging utilities
- tool handler and session helpers
- common config parsing and runtime utilities

## Docs, Scripts, and Infra

- `docs/` contains design docs, architecture notes, strategy documents, and operational guides relevant to the open-source connector layer.
- `scripts/` contains project bootstrap, secret creation, build, and deployment helpers for the open-source stack.
- `terraform/` contains GCP infrastructure for deploying the connector fleet and its supporting resources.
- `cloudbuild.yaml` and `cloudbuild-manual.yaml` define CI/CD and manual build/deploy flows for the connector fleet.

## What Is Deliberately Out of Scope Here

This repo does not contain the implementation of `Cesteral Intelligence`, including:

- org/workspace/project tenancy
- hosted connector configuration UI
- managed customer secret UX
- approval workflows and governance UX
- cross-server orchestration product logic
- commercial optimization/agent workflows
- hosted control-plane APIs

Those belong in the proprietary hosted product above this connector layer.
