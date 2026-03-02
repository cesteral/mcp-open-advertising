<div align="center">
  <h1>Cesteral MCP Server</h1>
  <p><b>Production-grade TypeScript MCP server template. Built for GCP Cloud Run deployment with stateless architecture, featuring declarative tools, robust error handling, DI, and OpenTelemetry observability.</b>
  <div>HTTP Transport • Stateless • GCP Cloud Run • OpenTelemetry</div>
  </p>
</div>

---

## ✨ Features

- **Declarative building blocks** – Define tools, resources, and prompts in single files; the container handles registration automatically.
- **DV360 API Integration** – Tools for campaign validation, spend monitoring, and performance tracking.
- **Consistent error handling** – `McpError` + `ErrorHandler` give uniform responses and rich telemetry context.
- **JWT Authentication** – Secure communication between Teams bot and MCP server.
- **Stateless Architecture** – No persistent storage required for v1, designed for scalable Cloud Run deployment.
- **Built-in observability** – Structured logging and OpenTelemetry enabled by default for production monitoring.
- **Dependency injection first** – `tsyringe`-powered container keeps dependencies explicit and test friendly.
- **Shared utility layer** – Reuse request-context helpers, `fetchWithTimeout`, sanitization, rate limiting, and telemetry helpers.
- **GCP Cloud Run** – Designed specifically for Cloud Run deployment with Terraform infrastructure.

## 🏗️ Architecture

This template follows a modular, domain-driven architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│              MCP Client (Claude Code, ChatGPT, etc.)    │
└────────────────────┬────────────────────────────────────┘
                     │ JSON-RPC 2.0
                     ▼
┌─────────────────────────────────────────────────────────┐
│           MCP Server (Tools, Resources)                 │
│           📖 [MCP Server Guide](src/mcp-server/)        │
└────────────────────┬────────────────────────────────────┘
                     │ Dependency Injection
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Dependency Injection Container                 │
│              📦 [Container Guide](src/container/)       │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
 ┌──────────┐   ┌──────────┐   ┌──────────┐
 │ Services │   │ Storage  │   │ Utilities│
 │ 🔌 [→]   │   │ 💾 [→]   │   │ 🛠️ [→]   │
 └──────────┘   └──────────┘   └──────────┘

[→]: src/services/    [→]: src/storage/    [→]: src/utils/
```

**Key Modules:**

- **[MCP Server](src/mcp-server/)** – Tools, resources, prompts, and transport layer implementations
- **[Container](src/container/)** – Dependency injection setup with tsyringe for clean architecture
- **[Services](src/services/)** – Placeholder for your external integrations (template ships without sample providers)
- **[Storage](src/storage/)** – Abstracted persistence layer with multiple backend support
- **[Utilities](src/utils/)** – Cross-cutting helpers for logging, request context, security, networking, and telemetry

> 💡 **Tip**: Each module has its own comprehensive README with architecture diagrams, usage examples, and best practices. Click the links above to dive deeper!

## 🛠️ Included Capabilities

This template includes working examples to get you started.

### Tools

| Tool                               | Description                                                       |
| :--------------------------------- | :---------------------------------------------------------------- |
| **`template_cat_fact`**            | Fetches a random cat fact from an external API.                   |
| **`template_image_test`**          | Returns a sample base64-encoded image payload.                    |
| **`template_madlibs_elicitation`** | Demonstrates elicitation by asking for words to complete a story. |

### Resources

| Resource   | URI                | Description                                   |
| :--------- | :----------------- | :-------------------------------------------- |
| **`echo`** | `echo://{message}` | A simple resource that echoes back a message. |

### Prompts

| Prompt            | Description                                                      |
| :---------------- | :--------------------------------------------------------------- |
| **`code-review`** | A structured prompt for guiding an LLM to perform a code review. |

## 🚀 Getting Started

### Deployment Configuration

This MCP server is designed to be called by MCP clients over HTTP. The server runs on GCP Cloud Run with the following configuration:

- **Transport:** HTTP only (port 8080 for Cloud Run)
- **Architecture:** Stateless - no persistent storage (reads from DV360/Bid Manager APIs)
- **Authentication:**
  - JWT for Teams bot → MCP server communication
  - Service Account for MCP server → DV360/Bid Manager APIs
- **Environment:** GCP Cloud Run with Terraform IaC
- **Observability:** OpenTelemetry enabled by default for production monitoring

### Prerequisites

- [Node.js v20.0.0](https://nodejs.org/) or higher
- [npm v10.0.0](https://www.npmjs.com/) or higher

**Install dependencies:**

```sh
npm install
```

## ⚙️ Configuration

All configuration is centralized and validated at startup in `src/config/index.ts`. Key environment variables in your `.env` file include:

| Variable                              | Description                                                              | Default               |
| :------------------------------------ | :----------------------------------------------------------------------- | :-------------------- |
| `MCP_TRANSPORT_TYPE`                  | Transport to run (always `http` for this server).                        | `http`                |
| `MCP_SESSION_MODE`                    | Session handling: `stateless`, `stateful`, or `auto`.                    | `auto`                |
| `MCP_HTTP_PORT`                       | Port for the HTTP server.                                                | `8080`                |
| `MCP_HTTP_HOST`                       | Host for the HTTP server (0.0.0.0 for Cloud Run).                        | `0.0.0.0`             |
| `MCP_AUTH_MODE`                       | Authentication mode (use `jwt` for production).                          | `none`                |
| `MCP_AUTH_SECRET_KEY`                 | **Required for `jwt` auth.** 32+ character secret shared with the MCP client. | `(none)`         |
| `MCP_ALLOWED_ORIGINS`                 | Optional CSV list of allowed origins for CORS.                           | `(none)`              |
| `OTEL_ENABLED`                        | Enable OpenTelemetry pipeline.                                           | `true`                |
| `OTEL_SERVICE_NAME`                   | Service name for OpenTelemetry traces/metrics.                           | `(from package.json)` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | OTLP endpoint for traces (e.g., Google Cloud Trace).                     | `(none)`              |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | OTLP endpoint for metrics.                                               | `(none)`              |
| `MCP_LOG_LEVEL`                       | Minimum log level (`debug`, `info`, `warn`, `error`, etc.).              | `debug`               |

### Authentication & Authorization

- **Modes**: `none` (default), `jwt` (requires `MCP_AUTH_SECRET_KEY`), or `oauth` (requires `OAUTH_ISSUER_URL` and `OAUTH_AUDIENCE`).
- **Enforcement**: Wrap your tool/resource `logic` functions with `withToolAuth([...])` or `withResourceAuth([...])` to enforce scope checks. Scope checks are bypassed for developer convenience when auth mode is `none`.

### Storage

This server is **stateless** and does not require persistent storage. The MCP server reads directly from platform APIs and returns results without caching. A no-op storage provider is included to satisfy the `IStorageProvider` interface but performs no actual operations.

Future versions may add persistent storage for:

- Caching validation results for improved performance
- Storing historical metrics and trend data
- Maintaining user preferences and saved queries

### Observability

- **Structured Logging**: Pino is integrated out-of-the-box. All logs are JSON and include the `RequestContext`.
- **OpenTelemetry**: **Enabled by default** for production monitoring. Configure OTLP endpoints for traces and metrics. All tool calls are automatically instrumented with traces, metrics (duration, payload sizes), and error tracking.

## ▶️ Running the Server

### Local Development

```sh
# Watch mode (HTTP transport)
npm run dev:http

# Or use the default dev command
npm run dev
```

### Production Build & Run

```sh
npm run build
npm run start:http
```

### Checks & Tests

```sh
npm run lint
npm run typecheck
npm run test
```

### GCP Cloud Run Deployment

Cesteral intelligence. is designed for GCP Cloud Run deployment:

1. **Build Docker Image:**

   ```sh
   docker build -t gcr.io/cesteral-labs/cesteral-mcp:latest .
   ```

2. **Deploy to Cloud Run:**

   ```sh
   gcloud run deploy cesteral-mcp \
     --image gcr.io/cesteral-labs/cesteral-mcp:latest \
     --platform managed \
     --region europe-west2 \
     --allow-unauthenticated
   ```

3. **Using Terraform:**
   See the `terraform/` directory for Infrastructure as Code configuration (to be added).

## 📂 Project Structure

| Directory                              | Purpose & Contents                                                                        | Guide                                |
| :------------------------------------- | :---------------------------------------------------------------------------------------- | :----------------------------------- |
| `src/mcp-server/tools/definitions`     | Declarative tool definitions (`*.tool.ts`).                                               | [📖 MCP Guide](src/mcp-server/)      |
| `src/mcp-server/resources/definitions` | Declarative resource definitions (`*.resource.ts`).                                       | [📖 MCP Guide](src/mcp-server/)      |
| `src/mcp-server/prompts/definitions`   | Prompt definitions registered with the server.                                            | [📖 MCP Guide](src/mcp-server/)      |
| `src/mcp-server/transports`            | HTTP transport implementation plus auth middleware.                                       | [📖 MCP Guide](src/mcp-server/)      |
| `src/storage`                          | `StorageService` with no-op provider (stateless architecture).                            | [💾 Storage Guide](src/storage/)     |
| `src/container`                        | DI tokens and registration functions.                                                     | [📦 Container Guide](src/container/) |
| `src/utils`                            | Shared utilities for logging, request context, security, networking, telemetry, and more. |                                      |
| `src/config`                           | Environment parsing + Zod validation.                                                     |                                      |
| `src/services`                         | Optional home for your external service integrations (template ships empty).              | [🔌 Services Guide](src/services/)   |

## 📚 Documentation

### Core Modules

- **[MCP Server Guide](src/mcp-server/)** - Complete guide to building MCP tools and resources
  - Creating tools with declarative definitions
  - Resource development with URI templates
  - Authentication and authorization
  - Transport layer (HTTP/stdio) configuration
  - SDK context and client interaction
  - Response formatting and error handling

- **[Container Guide](src/container/)** - Dependency injection with tsyringe
  - Understanding DI tokens and registration
  - Service lifetimes (singleton, transient, instance)
  - Constructor injection patterns
  - Testing with mocked dependencies
  - Adding new services to the container

- **[Services Guide](src/services/)** - Patterns for integrating external services
  - Directory structure for new service domains
  - Provider interfaces and DI registration
  - Health checks and error handling expectations
  - Guidance for adding your own integrations (no bundled providers in the template)

- **[Storage Guide](src/storage/)** - Abstracted persistence layer (no-op for v1)
  - No-op storage provider for stateless architecture
  - Storage interface design for future extensibility
  - Multi-tenancy patterns and tenant isolation
  - Secure cursor-based pagination
  - Batch operations and TTL support

### Additional Resources

- **[AGENTS.md](AGENTS.md)** - Strict development rules for AI agents

## 🧑‍💻 Agent Development Guide

For a strict set of rules when using this template with an AI agent, please refer to **`AGENTS.md`**. Key principles include:

- **Logic Throws, Handlers Catch**: Never use `try/catch` in your tool/resource `logic`. Throw an `McpError` instead.
- **Use Elicitation for Missing Input**: If a tool requires user input that wasn't provided, use the `elicitInput` function from the `SdkContext` to ask the user for it.
- **Pass the Context**: Always pass the `RequestContext` object through your call stack.
- **Use the Barrel Exports**: Register new tools and resources only in the `index.ts` barrel files.

## ❓ FAQ

- **Why is storage disabled?**
  - This server is stateless and reads directly from platform APIs. No caching or persistence is needed for the initial release.
- **Can I add persistent storage later?**
  - Yes! The storage interface is preserved. Future versions may add caching for results or historical metrics.
- **Why HTTP-only transport?**
  - This server is designed to be called by MCP clients over HTTP. STDIO transport is not needed for this use case.
- **What about OpenTelemetry?**
  - OpenTelemetry is **enabled by default** for production monitoring. Configure OTLP endpoints in your environment variables to send traces to Google Cloud Trace or other backends.
