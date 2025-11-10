# @bidshifter/shared

Shared types, utilities, and authentication for BidShifter MCP servers.

## Contents

### Types (`/types`)

- **MCP Types**: Base schemas for MCP tool responses, date ranges, pagination
- **Delivery Types**: Metrics, performance KPIs, pacing status, platform enums
- **Campaign Types**: Advertisers, campaigns, line items, revenue types, bid strategies
- **Optimization Types**: Adjustment schemas, recommendations, history, forecasts

All types are defined using Zod schemas for runtime validation and TypeScript type inference.

### Utilities (`/utils`)

- **Logger**: Pino-based structured logging with development/production modes
- **Errors**: Custom error classes (ValidationError, AuthenticationError, etc.)
- **Validation**: Zod schema validation helpers and date utilities
- **Request Context**: Request tracking with correlation IDs

### Authentication (`/auth`)

- **JWT**: Token verification and creation using `jose` library
- **Middleware**: Express middleware for JWT authentication (required and optional)

## Usage

```typescript
// Import types and schemas
import { campaignSchema, deliveryMetricsSchema } from "@bidshifter/shared/types";

// Import utilities
import { createLogger, ValidationError } from "@bidshifter/shared/utils";

// Import auth
import { authMiddleware, verifyJwt } from "@bidshifter/shared/auth";

// Or import everything
import { campaignSchema, createLogger, authMiddleware } from "@bidshifter/shared";
```

## Development

```bash
# Build
pnpm run build

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Test
pnpm run test
```
