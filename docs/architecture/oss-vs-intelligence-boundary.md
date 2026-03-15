# OSS vs. Cesteral Intelligence Boundary

This document defines the product and architecture boundary between the open-source MCP servers in this repository and the proprietary `Cesteral Intelligence` product.

## Summary

- This repository contains the open-source connector layer.
- All 13 MCP servers are intended to remain fully open source and self-hostable.
- `Cesteral Intelligence` is the hosted commercial control plane and agent layer above those servers.
- The commercial launch model is **Cesteral-hosted MCP servers only**. Customer self-hosting remains supported outside the hosted product, but is not part of the initial Intelligence integration surface.

## What belongs in OSS

The OSS layer includes:

- Platform MCP servers, tools, prompts, and resources
- Platform-specific API clients and auth adapters
- Shared runtime utilities, observability hooks, error handling, and transport helpers
- Deployment guidance, Terraform, CI/CD, and self-hosting examples
- Contract and compatibility standards for connector behavior

The OSS layer does **not** depend on `Cesteral Intelligence` to be usable.

## What belongs in Cesteral Intelligence

`Cesteral Intelligence` owns the hosted product concerns:

- Multi-tenant org, workspace, and project model
- Connector onboarding and configuration UI
- Managed customer credential collection and secret lifecycle
- Hosted MCP fleet management
- Cross-server orchestration and agent workflows
- Approval policies, audit trails, and governance controls
- Scheduling, alerting, monitoring, and operational UX
- Commercial reasoning, optimization, and workflow automation layers

## Hosting Model

The initial commercial model is:

- Cesteral hosts and operates the MCP server fleet used by Intelligence
- Customers configure those hosted connectors through Intelligence
- Customers may still self-host the OSS MCP servers independently
- Intelligence does not initially connect to customer-hosted MCP servers

Future support for customer-hosted connector registration is possible, but intentionally deferred because it adds significant complexity in trust, networking, compatibility, and support.

## Auth and Credential Boundary

Two concerns must stay separate:

1. **MCP ingress auth**
   - Controls who can call the hosted MCP servers
   - Managed by the commercial product and its auth boundary

2. **Platform auth**
   - Controls how the MCP servers authenticate to Google, Meta, TTD, TikTok, etc.
   - Managed inside the connector runtime using platform-specific credentials

For the hosted product:

- Customer ad-platform credentials are entered into `Cesteral Intelligence`
- Credentials are stored in Cesteral-managed secret infrastructure
- Hosted MCP servers receive the credentials they need from that managed infrastructure
- Tenant isolation and authorization policy primarily live in Intelligence, not in each MCP server

## Design Rules

- Do not cripple the open-source servers to protect the commercial product.
- Do not move orchestration, tenancy, approvals, or hosted secret UX into this repo.
- Do not create a separate proprietary connector interface for Intelligence.
- Intelligence should consume the same MCP servers that customers can self-host.
- Keep the OSS/commercial split obvious in docs and product messaging.

## Implications for This Repo

- README and architecture docs should describe this repo as the connector layer.
- Deployment work here should optimize for genuinely self-hostable, production-capable MCP services.
- Future hosted-product docs in this repo should describe integration boundaries, not proprietary implementation details.
