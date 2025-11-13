# Phase 1 Implementation Checklist

## Overview

This checklist breaks down Phase 1 (MVP) of the OpenAPI schema extraction system into concrete, actionable tasks. Phase 1 focuses on proving the core concept with minimal complexity.

**Timeline:** Weeks 1-2
**Goal:** Extract 5-10 root schemas from DV360 v4 Discovery Document and generate TypeScript + Zod schemas

---

## Week 1: Setup & Infrastructure

### 1.1 Dependencies
- [ ] Install extraction dependencies
  ```bash
  cd packages/dv360-mcp
  pnpm add -D openapi-typescript openapi-zod-client
  pnpm add -D tsx # for running TypeScript scripts
  ```
- [ ] Install utility dependencies
  ```bash
  pnpm add -D js-yaml # for reading/writing YAML
  pnpm add -D node-fetch # for fetching Discovery docs
  pnpm add -D minimatch # for glob pattern matching
  ```

### 1.2 Directory Structure
- [ ] Create scripts directory
  ```bash
  mkdir -p packages/dv360-mcp/scripts/lib
  ```
- [ ] Create temporary specs directory (gitignored)
  ```bash
  mkdir -p packages/dv360-mcp/.tmp-specs
  ```
- [ ] Update `.gitignore`
  ```
  # Temporary specs (fetched at build time)
  .tmp-specs/
  *.discovery.json

  # DO NOT ignore generated schemas (these are committed)
  # src/generated/schemas/
  ```

### 1.3 Configuration Files
- [x] Create `config/schema-extraction.config.ts` ✅
- [ ] Verify configuration loads correctly
  ```bash
  tsx -e "import { VALIDATED_CONFIG } from './config/schema-extraction.config'; console.log(VALIDATED_CONFIG)"
  ```

---

## Week 2: Core Extraction Logic

### 2.1 Discovery Document Fetcher
**File:** `scripts/lib/fetch-discovery.ts`

- [ ] Implement `fetchDiscoveryDoc()` function
  - Construct URL from config: `${baseUrl}?version=${apiVersion}`
  - Add timeout support
  - Return typed `DiscoveryDocument` interface
- [ ] Implement caching logic
  - Cache key: `discovery-dv360-${apiVersion}-${YYYYMMDD}.json`
  - Check cache age against `cacheTTL`
  - Save to `.tmp-specs/cache/`
- [ ] Implement retry logic with exponential backoff (3 attempts)
- [ ] Add error handling with `ExtractionError` class

**Acceptance Criteria:**
```typescript
const doc = await fetchDiscoveryDoc(config);
console.log(doc.schemas['InsertionOrder']); // Should print schema definition
```

### 2.2 Schema Extractor (Core Algorithm)
**File:** `scripts/lib/schema-extractor.ts`

- [ ] Create `SchemaExtractor` class
- [ ] Implement `extract()` method (main entry point)
- [ ] Implement `extractRecursive()` method with:
  - Max depth checking
  - Circular reference detection
  - Already-extracted checking
  - Dependency resolution via `findDependencies()`
- [ ] Implement `findDependencies()` method
  - Walk schema tree to find all `$ref` references
  - Extract schema names from refs like `"schemas/Budget"` → `"Budget"`
  - Handle `additionalProperties.$ref`
  - Handle `items.$ref` for arrays
- [ ] Implement `addCommonTypes()` method
  - Hardcoded list: `['Date', 'Money', 'Status', 'EntityStatus', 'TimeOfDay', 'LatLng']`
  - Only add if present in Discovery doc and `includeCommonTypes: true`
- [ ] Implement `applyExclusions()` method
  - Use minimatch for glob pattern matching
  - Remove excluded schemas from extracted set
- [ ] Implement `generateReport()` method
  - Return `ExtractionReport` with metadata, results, dependency graph

**Acceptance Criteria:**
```typescript
const extractor = new SchemaExtractor(discoveryDoc, config);
const { schemas, report } = await extractor.extract();
console.log(`Extracted ${report.results.totalSchemas} schemas`);
console.log(`Root schemas: ${report.results.rootSchemas.length}`);
console.log(`Dependencies: ${report.results.resolvedDependencies.length}`);
```

### 2.3 Discovery → OpenAPI Converter
**File:** `scripts/lib/convert-to-openapi.ts`

- [ ] Create `convertToOpenAPI()` function
- [ ] Convert schema references
  - Discovery: `$ref: "Budget"` → OpenAPI: `$ref: "#/components/schemas/Budget"`
- [ ] Convert schema structures
  - Map Discovery `type`, `properties`, `items` to OpenAPI equivalents
  - Preserve `description`, `enum`, `format` fields
- [ ] Handle Discovery-specific patterns
  - `additionalProperties` with `$ref`
  - `enum` arrays with `enumDescriptions` (copy to `x-enumDescriptions`)
  - `repeated: true` fields (convert to `type: array`)
- [ ] Generate OpenAPI 3.0 wrapper
  ```yaml
  openapi: 3.0.0
  info:
    title: DV360 API Minimal Schema
    version: v4
    x-extraction-metadata: { ... }
  components:
    schemas: { ... }
  ```
- [ ] Generate conversion report (`.tmp-specs/conversion-report.json`)
  - List unmapped fields
  - List lossy conversions
  - List newly introduced schemas

**Acceptance Criteria:**
```typescript
const openApiSpec = await convertToOpenAPI(schemas, config);
console.log(openApiSpec.openapi); // "3.0.0"
console.log(Object.keys(openApiSpec.components.schemas).length); // ~50 schemas
```

### 2.4 Error Handling
**File:** `scripts/lib/errors.ts`

- [ ] Create `ExtractionError` class
  ```typescript
  class ExtractionError extends Error {
    constructor(message: string, code: string, details?: Record<string, any>)
  }
  ```
- [ ] Define error codes
  ```typescript
  export const ErrorCodes = {
    DISCOVERY_FETCH_FAILED: 'DISCOVERY_FETCH_FAILED',
    SCHEMA_NOT_FOUND: 'SCHEMA_NOT_FOUND',
    CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
    MAX_DEPTH_EXCEEDED: 'MAX_DEPTH_EXCEEDED',
    // ...
  } as const;
  ```

### 2.5 Main Generation Script
**File:** `scripts/generate-schemas.ts`

- [ ] Implement main pipeline orchestration
  1. Fetch Discovery Document
  2. Extract schemas
  3. Convert to OpenAPI
  4. Save OpenAPI spec to `.tmp-specs/dv360-minimal-v4.yaml`
  5. Generate TypeScript types via `openapi-typescript`
  6. Generate Zod schemas via `openapi-zod-client`
  7. Save extraction report
- [ ] Add progress logging
  ```
  🚀 Starting schema generation pipeline...
  📥 Step 1/5: Fetching Discovery Document...
     ✓ Fetched 1.3 MB
  🔍 Step 2/5: Extracting schemas...
     ✓ Extracted 47 schemas
  ...
  ```
- [ ] Add error handling with process.exit(1) on failure
- [ ] Add summary statistics at end

**Acceptance Criteria:**
```bash
tsx scripts/generate-schemas.ts
# Should complete successfully and generate files
```

---

## Week 2: Code Generation Integration

### 3.1 TypeScript Type Generation
- [ ] Configure `openapi-typescript` command
  ```bash
  openapi-typescript .tmp-specs/dv360-minimal-v4.yaml -o src/generated/schemas/types.ts
  ```
- [ ] Add npm script to `package.json`
  ```json
  "codegen:types": "openapi-typescript .tmp-specs/dv360-minimal-v4.yaml -o src/generated/schemas/types.ts"
  ```
- [ ] Verify generated types are valid TypeScript
  ```bash
  pnpm run codegen:types && tsc --noEmit src/generated/schemas/types.ts
  ```

### 3.2 Zod Schema Generation
- [ ] Configure `openapi-zod-client` command
  ```bash
  openapi-zod-client .tmp-specs/dv360-minimal-v4.yaml -o src/generated/schemas/zod.ts
  ```
- [ ] Add npm script to `package.json`
  ```json
  "codegen:zod": "openapi-zod-client .tmp-specs/dv360-minimal-v4.yaml -o src/generated/schemas/zod.ts"
  ```
- [ ] Verify generated schemas are valid
  ```bash
  pnpm run codegen:zod && tsc --noEmit src/generated/schemas/zod.ts
  ```

### 3.3 Combined Scripts
- [ ] Add unified generation script
  ```json
  "generate:schemas": "tsx scripts/generate-schemas.ts"
  ```
- [ ] Add prebuild hook
  ```json
  "prebuild": "pnpm run generate:schemas"
  ```
- [ ] Add watch mode for development
  ```json
  "generate:schemas:watch": "tsx watch scripts/generate-schemas.ts"
  ```

---

## Week 2: Validation & Testing

### 4.1 Manual Validation
- [ ] Run full pipeline and verify outputs
  ```bash
  pnpm run generate:schemas
  ls -lh .tmp-specs/
  ls -lh src/generated/schemas/
  ```
- [ ] Verify extraction report
  ```bash
  cat .tmp-specs/extraction-report.json | jq '.results'
  ```
- [ ] Verify generated types compile
  ```bash
  pnpm run typecheck
  ```

### 4.2 Integration Test
**File:** `scripts/__tests__/generate-schemas.test.ts`

- [ ] Test full pipeline execution
  ```typescript
  it('should generate valid TypeScript types', async () => {
    execSync('pnpm run generate:schemas');

    const typesPath = path.join(process.cwd(), 'src/generated/schemas/types.ts');
    await expect(fs.access(typesPath)).resolves.toBeUndefined();

    const typesContent = await fs.readFile(typesPath, 'utf-8');
    expect(typesContent).toContain('export interface InsertionOrder');
  });
  ```

### 4.3 Schema Validation Test
**File:** `scripts/__tests__/schema-validation.test.ts`

- [ ] Test Zod schemas validate mock data
  ```typescript
  it('should validate InsertionOrder mock data', () => {
    const { InsertionOrderSchema } = require('../../src/generated/schemas/zod');

    const mockData = {
      insertionOrderId: '12345',
      displayName: 'Test Campaign',
      advertiserId: '67890',
    };

    expect(() => InsertionOrderSchema.parse(mockData)).not.toThrow();
  });
  ```

### 4.4 Performance Benchmark
- [ ] Measure pipeline execution time
  ```bash
  time pnpm run generate:schemas
  ```
- [ ] Record baseline metrics
  - Discovery doc fetch time: ___ms
  - Extraction time: ___ms
  - Conversion time: ___ms
  - Type generation time: ___ms
  - Zod generation time: ___ms
  - **Total time: ___ms**
- [ ] Record output sizes
  - Discovery doc size: ___ KB
  - Extracted spec size: ___ KB
  - Compression ratio: ___%
  - Generated types size: ___ KB
  - Generated Zod size: ___ KB

---

## Definition of Done (Phase 1)

### Must Have ✅
- [ ] Configuration file validates and loads correctly
- [ ] Discovery document fetches successfully with caching
- [ ] Schema extraction works for 5-10 root schemas
- [ ] Dependency resolution extracts all referenced schemas
- [ ] Circular references are detected (fail if found)
- [ ] Common types are included automatically
- [ ] OpenAPI 3.0 spec is generated correctly
- [ ] TypeScript types are generated and compile
- [ ] Zod schemas are generated and validate
- [ ] Extraction report is generated with accurate statistics
- [ ] Pipeline runs in <30 seconds (including network fetch)
- [ ] All generated code passes TypeScript compiler
- [ ] At least 1 integration test passes

### Nice to Have 🎯
- [ ] Extraction report includes dependency graph visualization
- [ ] Console output has colored progress indicators
- [ ] Generated code includes JSDoc comments from Discovery doc
- [ ] Comparison with googleapis bundle size documented

### Out of Scope (Phase 2+) 🚫
- ❌ Operation-based extraction (`operations` array)
- ❌ Resource scope discovery (`resourceScopes`)
- ❌ Usage trace discovery (telemetry-driven)
- ❌ CI/CD automation (weekly schema updates)
- ❌ Live response smoke tests against real API
- ❌ Migration of existing code to use generated schemas
- ❌ Size threshold validation (need baseline first)

---

## Key Success Metrics

### Correctness
- All root schemas from config are present in output
- All dependencies are resolved (no missing refs)
- Generated TypeScript compiles without errors
- Generated Zod schemas validate mock data

### Performance
- Full pipeline completes in <30 seconds
- Extracted spec is <200 KB (vs ~1.3 MB full Discovery doc)
- Generated types are <100 KB

### Developer Experience
- Single command generates all schemas: `pnpm run generate:schemas`
- Clear error messages when extraction fails
- Detailed report shows what was extracted and why

---

## Risk Mitigation

### Risk: External tools break
**Mitigation:** Pin exact versions of `openapi-typescript` and `openapi-zod-client` in package.json

### Risk: Circular references break code generators
**Mitigation:** Fail extraction if circular refs detected (`failOnCircularRefs: true`)

### Risk: Discovery doc fetch fails in CI
**Mitigation:** Cache is committed to git as fallback (if needed)

### Risk: Generated code is too large
**Mitigation:** Start with minimal root schemas (5-10), expand incrementally

### Risk: Discovery format changes
**Mitigation:** Version lock to DV360 v4, add integration tests

---

## Next Steps After Phase 1

Once Phase 1 is complete and validated:

1. **Measure baselines** → Set size thresholds (`warnOnSizeThreshold`, `failOnSizeLimit`)
2. **Add more schemas** → Expand `rootSchemas` array to cover more use cases
3. **Add operation extraction** → Implement `operations` array support (Phase 2)
4. **Migrate existing code** → Update 1-2 tools to use generated schemas
5. **Add CI/CD** → Automate weekly schema updates (Phase 3)

---

## Questions for Product/Engineering

- [ ] Do we need to support multiple DV360 API versions (v3 + v4) simultaneously?
- [ ] Should generated schemas be committed to git or generated on-demand?
- [ ] What is our strategy if a schema update breaks existing code in production?
- [ ] Do we need to support gradual rollout of schema updates (canary deployment)?
