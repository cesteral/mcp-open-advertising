# Amazon Ads API v1 — Reference Documentation

> **Source:** Amazon Ads Advanced Tools Center  
> **URLs:**
> - https://advertising.amazon.com/API/docs/en-us/reference/amazon-ads/overview
> - https://advertising.amazon.com/API/docs/en-us/reference/amazon-ads/getting-started
> - https://advertising.amazon.com/API/docs/en-us/guides/get-started/generate-sdk

---

## Table of Contents

1. [Amazon Ads API v1 Overview](#amazon-ads-api-v1-overview)
2. [Getting Started with Amazon Ads API v1](#getting-started-with-amazon-ads-api-v1)
3. [Generate a Client Library and SDK](#generate-a-client-library-and-sdk)

---

## Amazon Ads API v1 Overview

The Amazon Ads API v1 represents a reimagined approach to our Ads API, built from the ground up with consistency and efficiency in mind. The new API provides a seamless experience across all Amazon advertising products through a common model. This common model introduces standard concepts, naming, and consistent API behavior across Sponsored Products, Sponsored Brands, Sponsored Display, Sponsored Television, and Amazon DSP.

> If you're just starting out using Amazon Ads APIs, it is highly recommended to use these v1 APIs. They will eventually fully replace the ad product-specific APIs.

### Getting Started

To learn about prerequisites, header values, and access, see [Getting Started with Amazon Ads API v1](#getting-started-with-amazon-ads-api-v1). To get started with campaign management, see the campaign management overview and entity guides.

### Key Benefits

- **Consistent experience:** Common field names, error handling, and resource patterns across all advertising products.
- **Reduced development effort:** Significantly less code duplication when implementing features across multiple ad products.
- **Single integration:** Integrate once and access multiple ad products (Sponsored Products, Sponsored Brands, Sponsored Display, etc.) through a consistent API interface.
- **Future-ready:** New features and ad products will be built into this consistent framework.
- **Predictable updates:** Clear versioning strategy, support windows, and deprecation timelines for major versions.

### Vision

The Amazon Ads API v1 establishes the foundation for all future Amazon Ads API development. The long-term vision includes:

- Building all new features and capabilities into the common model
- Expanding the common model across all advertising products
- Maintaining predictable release cycles and deprecation schedules
- Providing a seamless upgrade path for developers

### Developer Experience

This new API structure is designed to make the development process more efficient:

- Consistent error codes and messaging across products
- Simplified documentation and implementation guides
- Reusable code patterns across different ad products
- Reduced time to market for new feature adoption
- Consistent OAS file and namespacing for easy generation or integration into a client

### General Availability and Beta Releases

For v1 APIs in beta, see the Betas section. APIs that have been released will be visible in the v1 API spec.

For news on feature expansions and other updates, see the API v1 release notes.

### Future Vision

The long-term vision for the Ads API v1 is to continue expanding coverage of Amazon's advertising products and features. Plans include generating all APIs from a common domain model, ensuring consistent data representations and functionality across ad products.

Key areas expected to expand in the future include support for:

- Reporting
- Recommendations
- Rules
- Media planning

---

## Getting Started with Amazon Ads API v1

### Prerequisites

All clients who have completed onboarding to the Amazon Ads API are permitted to call the Ads API v1 generally.

> **Closed Betas:** Certain resources may be listed as closed beta, requiring a request to join the beta program for access.

### Required Headers

Just as for other Amazon Ads APIs, Ads API v1 requests must provide `Amazon-Ads-ClientId` and `Authorization` headers to authorize calls.

Additional headers may be required depending on the functionality and ad product:

| Header | Required For | Description |
|--------|-------------|-------------|
| `Amazon-Advertising-API-Scope` | Most sponsored ads requests | Profile ID of the desired advertiser and marketplace. Retrieve using the Profiles API or Manager Accounts API. |
| `Amazon-Ads-AccountId` | ADSP and cross-product requests | For ADSP: use DSP Advertisers API `advertiserId` or Manager Accounts API `dspAdvertiserId`. |
| `Amazon-Ads-Manager-AccountId` | Manager account operations | Manager account ID. |

### Understanding Advertising Accounts

Amazon Ads API v1 uses a unified account model that works across headers and request body fields.

#### Account Types and Relationships

| Concept | Description |
|---------|-------------|
| **Advertising Account** | The primary account entity containing campaigns and data across all ad products. |
| **Profile ID** | Identifier used for sponsored ads operations (`Amazon-Advertising-API-Scope` header). |
| **Account ID** | Identifier used for cross-product operations (`Amazon-Ads-AccountId` header). |

#### Header vs. Body Field Usage

- **Headers:** Use appropriate account identifiers for account-scoped operations.
- **Body fields:** Use `advertiserAccount.id` in request bodies to specify which account's data to retrieve or modify.
- **Access requested accounts:** Use the `accessRequested` field to specify which accounts to access in multi-account scenarios.

### OpenAPI Specification Interface

The Amazon Ads API v1 OpenAPI specification is presented in an enhanced interface featuring a new ad product selection control for select APIs (e.g., campaign management).

- **Default view:** Displays a specification common to all ad products, including all available attributes.
- **Ad product selected:** Displays a specification specific to that ad product, including only the attributes that apply to that entity for that ad product.

The **Download OpenAPI spec** link adjusts depending on whether an ad product is selected.

### Implementation Recommendations

#### Test Accounts

You can use existing accounts or create a test account for testing. See Test Account Overview for more information on setup.

---

## Generate a Client Library and SDK

### Introduction

One major benefit of the Amazon Ads API v1 common model is improved compatibility with code generation tools such as client library generators. The following walkthrough uses **OpenAPI Generator** to create a client library for campaign management from the Ads API v1 specifications in **TypeScript**.

> **Other languages:** OpenAPI Generator supports numerous other languages. You can adapt the approach below to generate client libraries and SDKs in your language of choice.

### Prerequisites

#### Authentication and Authorization

You must have already onboarded to the Amazon Ads API. You will need:

- Client ID and client secret
- Access token
- Refresh token
- Profile ID

#### Node

The example code is configured to use **Node 24**. Adjustments are required for earlier versions.

#### Java

The `openapi-generator-cli` NPM package is a wrapper around the OpenAPI Generator core (a Java project). Requires the `java` executable in your `PATH` at a minimum version of **JDK 11**.

---

### Step 1: Set Up the Workspace

```bash
# Set up the workspace
cd ~/Desktop  # choose a different parent directory if desired
mkdir amazon-ads-workspace
cd amazon-ads-workspace

mkdir packages
cd packages
mkdir amazon-ads-library-demo
mkdir amazon-ads-client-demo
```

This creates the following directory structure:

```
amazon-ads-workspace
└── packages
    ├── amazon-ads-library-demo
    └── amazon-ads-client-demo
```

- `amazon-ads-library-demo` — contains input and processing scripts to generate a client library from the OpenAPI specification.
- `amazon-ads-client-demo` — contains a demonstration client that uses the generated client library.

#### Step 1a: Create Workspace Build Scripts (Optional)

Create a `package.json` in the workspace root to add scripts that build each package or the workspace as a whole:

```json
{
  "name": "amazon-ads-workspace",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "build:sdk": "npm run build -w amazon-ads-library-demo",
    "build:client": "npm run build -w amazon-ads-client-demo"
  }
}
```

---

### Step 2: Set Up the Client Library Package

```bash
# Set up client library package
cd amazon-ads-library-demo
npm init -y
mkdir input
mkdir scripts
```

#### Step 2a: Add OAS Files

Download the OpenAPI specification files for Ads API v1 campaign management. Available specifications:

| Specification | Filename |
|--------------|----------|
| Common (all products) | `AmazonAdsAPIALL_prod_3p.json` |
| Sponsored Products | `AmazonAdsAPISP_prod_3p.json` |
| Sponsored Brands | `AmazonAdsAPISB_prod_3p.json` |
| Amazon DSP | `AmazonAdsAPIDSP_prod_3p.json` |
| Sponsored Display | `AmazonAdsAPIDSD_prod_3p.json` |
| Sponsored Television | `AmazonAdsAPIST_prod_3p.json` |

> The common specification, Sponsored Products specification, and Sponsored Brands specification are required for the code examples in the client demo below.

Add these files to the `/input` directory. Your file tree should resemble:

```
amazon-ads-workspace
└── packages
    ├── amazon-ads-library-demo
    │   ├── input
    │   │   ├── AmazonAdsAPIALL_prod_3p.json
    │   │   ├── AmazonAdsAPISB_prod_3p.json
    │   │   └── AmazonAdsAPISP_prod_3p.json
    │   └── scripts
    └── amazon-ads-client-demo
```

> **Note:** Preserve filenames as downloaded. The processing script requires filenames matching the `AmazonAdsAPI.*_prod_3p.json` pattern.

#### Step 2b: Add the Processing Script

Create `scripts/processSpecs.cjs`. This script prunes the OAS contracts (removes polymorphism, auth header parameters) and outputs a singular client library in the `/generated` directory.

- Unified models: `/v1`
- Ad product-specific models: `/v1/<product>` (e.g., `/v1/sp`)

```javascript
// amazon-ads-workspace/packages/amazon-ads-library-demo/scripts/processSpecs.cjs
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directory paths
const INPUT_DIR = path.resolve('./input');
const PRUNED_DIR = path.resolve('./pruned');
const GENERATED_DIR = path.resolve('./generated');
const V1_DIR = path.resolve(GENERATED_DIR, 'v1');

// Ensure directories exist
[PRUNED_DIR, GENERATED_DIR, V1_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function removePolymorphism(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => removePolymorphism(item));

  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[key] = removePolymorphism(value);
    if (key === 'oneOf') {
      const unionedProps = {};
      for (const polyObj of value || []) {
        if (!polyObj.properties) {
          const schemaRef = polyObj.$ref;
          if (schemaRef) {
            const match = schemaRef.match(/#\/components\/schemas\/([a-zA-Z]+)/);
            if (match) {
              const schemaName = match[1];
              const camelCaseName = schemaName.charAt(0).toLowerCase() + schemaName.slice(1);
              unionedProps[camelCaseName] = polyObj;
            }
          }
        } else {
          Object.assign(unionedProps, polyObj.properties);
        }
      }
      if ('properties' in obj) throw new Error('Polymorphic object already has properties field.');
      newObj.properties = unionedProps;
      delete newObj[key];
    }
    if (key === 'discriminator') delete newObj[key];
  }
  return newObj;
}

function renameError(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const problemErrorName = 'Error';
  const modelErrorName = 'ModelError';
  obj = replaceErrorSchemaReferences(obj, problemErrorName, modelErrorName);
  const components = obj.components;
  if (components && typeof components.schemas == 'object') {
    const schemas = components.schemas;
    if (schemas[problemErrorName] != null) {
      schemas[modelErrorName] = schemas[problemErrorName];
      delete schemas[problemErrorName];
    }
  }
  return obj;
}

function replaceErrorSchemaReferences(obj, problemErrorName, modelErrorName) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => replaceErrorSchemaReferences(item, problemErrorName, modelErrorName));
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[key] = replaceErrorSchemaReferences(value, problemErrorName, modelErrorName);
    if (key === '$ref' && value === `#/components/schemas/${problemErrorName}`) {
      newObj[key] = `#/components/schemas/${modelErrorName}`;
    }
  }
  return newObj;
}

function findInputFiles() {
  const files = fs.readdirSync(INPUT_DIR);
  return files.filter(file => file.match(/AmazonAdsAPI.*_prod_3p\.json/));
}

function getAdProduct(filename) {
  const match = filename.match(/AmazonAdsAPI(.*)_prod_3p\.json/);
  if (!match || !match[1]) return 'ALL';
  return match[1].toLowerCase();
}

async function removeRuntimeExports(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    if (file.endsWith('.ts')) {
      const filePath = path.join(directory, file);
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/export \* from ['"]\.\/.runtime\.js['"];?\n?/g, '');
      content = content.replace(/import \{[^}]*\} from ['"]\.\/.runtime\.js['"];?\n?/g, '');
      content = content.replace(/import \* as runtime from ['"]\.\/.runtime\.js['"];?\n?/g, '');
      fs.writeFileSync(filePath, content);
    }
  }
}

function updateRuntimeImports(directory, isAllProduct) {
  const processDirectory = (dir) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.endsWith('.ts')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (isAllProduct) {
          content = content.replace(/from ['"]\.\.\/.runtime\.js['"];/g, "from '../../runtime.js';");
        } else {
          content = content.replace(/from ['"]\.\.\/.runtime\.js['"];/g, "from '../../../runtime.js';");
        }
        fs.writeFileSync(fullPath, content);
      }
    });
  };
  processDirectory(directory);
}

function processSpecFile(filename) {
  const adProduct = getAdProduct(filename);
  const inputPath = path.join(INPUT_DIR, filename);
  const inputSpec = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  let processedSpec = removePolymorphism(inputSpec);
  processedSpec = renameError(processedSpec);

  const prunedFilename = `pruned_${filename}`;
  const prunedPath = path.join(PRUNED_DIR, prunedFilename);
  fs.writeFileSync(prunedPath, JSON.stringify(processedSpec, null, 2));

  let outputDir = adProduct.toLowerCase() === 'all' ? V1_DIR : path.join(V1_DIR, adProduct);
  if (adProduct.toLowerCase() !== 'all' && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const generatorCommand = `openapi-generator-cli generate \
    -i "${prunedPath}" \
    -g typescript-fetch \
    -o "${outputDir}" \
    --additional-properties="disallowAdditionalPropertiesIfNotPresent=false" \
    --additional-properties="enumPropertyNaming=PascalCase" \
    --additional-properties="importFileExtension=.js" \
    --additional-properties="modelPropertyNaming=camelCase" \
    --additional-properties="paramNaming=camelCase" \
    --additional-properties="supportsES6=true" \
    --additional-properties="useSingleRequestParameter=true" \
    --additional-properties="withInterfaces=true" \
    --additional-properties="enumUnknownDefaultCase=true" \
    --additional-properties="removeEnumValuePrefix=false" \
    --additional-properties="sortParamsByRequiredFlag=false" \
    --additional-properties="sortModelPropertiesByRequiredFlag=false"`;

  try {
    execSync(generatorCommand, { stdio: 'inherit' });
    if (adProduct.toLowerCase() !== 'all') {
      removeRuntimeExports(outputDir);
      updateRuntimeImports(outputDir, false);
    } else {
      updateRuntimeImports(path.join(V1_DIR, 'apis'), true);
      updateRuntimeImports(path.join(V1_DIR, 'models'), true);
    }
    return adProduct;
  } catch (error) {
    console.error(`Error generating client library for ${adProduct}:`, error);
    return null;
  }
}

function generateIndexFile(adProducts) {
  const indexPath = path.join(V1_DIR, 'index.ts');
  let indexContent = `// Auto-generated index file\n\n`;
  if (adProducts.includes('ALL')) {
    indexContent += `export * from './runtime.js';\n`;
  }
  adProducts.forEach(product => {
    if (product.toLowerCase() === 'all') {
      indexContent += `export * from './models/index.js';\nexport * from './apis/index.js';\n`;
    } else {
      indexContent += `export * as v1_${product.toLowerCase()} from './${product.toLowerCase()}/index.js';\n`;
    }
  });
  fs.writeFileSync(indexPath, indexContent);
}

function setupRootFiles(adProducts) {
  const v1RuntimePath = path.join(V1_DIR, 'runtime.ts');
  const rootRuntimePath = path.join(GENERATED_DIR, 'runtime.ts');
  if (fs.existsSync(v1RuntimePath)) {
    fs.copyFileSync(v1RuntimePath, rootRuntimePath);
  }

  const rootIndexPath = path.join(GENERATED_DIR, 'index.ts');
  let rootIndexContent = `// Auto-generated root index file\n\nexport * from './runtime.js';\n`;
  const sortedProducts = [...adProducts].sort((a, b) => {
    if (a.toLowerCase() === 'all') return 1;
    if (b.toLowerCase() === 'all') return -1;
    return a.localeCompare(b);
  });
  sortedProducts.forEach(product => {
    if (product.toLowerCase() === 'all') {
      rootIndexContent += `export * as v1 from './v1/index.js';\n`;
    } else {
      rootIndexContent += `export * as v1_${product.toLowerCase()} from './v1/${product.toLowerCase()}/index.js';\n`;
    }
  });
  fs.writeFileSync(rootIndexPath, rootIndexContent);

  const v1IndexPath = path.join(V1_DIR, 'index.ts');
  fs.writeFileSync(v1IndexPath, `// Auto-generated v1 index file\n\nexport * from './models/index.js';\nexport * from './apis/index.js';\n`);
}

function main() {
  const inputFiles = findInputFiles();
  if (inputFiles.length === 0) {
    console.error('No input files found');
    process.exit(1);
  }
  const adProducts = inputFiles.map(processSpecFile).filter(p => p !== null);
  generateIndexFile(adProducts);
  setupRootFiles(adProducts);
  console.log('Processing complete!');
}

main();
```

#### Step 2c: Add Configuration Files

**`amazon-ads-library-demo/package.json`:**

```json
{
  "name": "amazon-ads-library-demo",
  "version": "1.0.0",
  "engines": { "node": ">=20.0.0" },
  "engineStrict": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "clean": "rm -rf generated dist",
    "process-specs": "node scripts/processSpecs.cjs",
    "prebuild": "npm run process-specs",
    "build": "tsc",
    "prepare": "npm run clean && npm run build"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.8.3",
    "@openapitools/openapi-generator-cli": "^2.21.4",
    "@types/node": "^24.0.14"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"]
}
```

**`amazon-ads-library-demo/tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["es2022", "dom", "dom.iterable"],
    "allowJs": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "emitDeclarationOnly": false,
    "esModuleInterop": true,
    "outDir": "dist",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": false,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": ["./node_modules/@types"],
    "skipLibCheck": true
  },
  "include": ["generated"],
  "exclude": ["node_modules"]
}
```

#### Step 2d: Generate the Client Library

Install dependencies and create a local link (first time only):

```bash
npm install
npm link
```

To generate the client library (first time or to incorporate OAS updates):

```bash
npm run build
```

---

### Step 3: Set Up the Client Package

```bash
# Set up client package
cd ../amazon-ads-client-demo
npm init -y
npm link amazon-ads-library-demo   # makes client library import available locally
mkdir src
```

#### Step 3a: Set Up Auth Credentials

Create `src/auth_config.ts` and replace the placeholder values with your credentials:

```typescript
// amazon-ads-workspace/packages/amazon-ads-client-demo/src/auth_config.ts
import axios from 'axios';

export const CLIENT_ID = 'INSERT_CLIENT_ID';
export const CLIENT_SECRET = 'INSERT_CLIENT_SECRET';
export const REFRESH_TOKEN = 'INSERT_REFRESH_TOKEN';
export const PROFILE_ID = 'INSERT_PROFILE_ID';

export async function getAccessToken(): Promise<string> {
  try {
    const response = await axios.post(
      'https://api.amazon.com/auth/o2/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: REFRESH_TOKEN,
        client_secret: CLIENT_SECRET
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}
```

#### Step 3b: Create the Client Application

Create `src/client.ts`. This demonstrates three operations:
1. Create a Sponsored Products campaign using the common `CampaignCreate` model
2. Create a Sponsored Brands campaign using the `SBCampaignCreate` model
3. Create a Sponsored Products campaign using the `SPCampaignCreate` model

> **Note:** All campaigns are created in `PAUSED` state. To test enabled campaign creation, use a test account.

```typescript
// amazon-ads-workspace/packages/amazon-ads-client-demo/src/client.ts
import {v1, v1_sb, v1_sp, ResponseError, Configuration} from "amazon-ads-library-demo";
import { CLIENT_ID, PROFILE_ID, getAccessToken } from './auth_config.js';

async function createAdClient() {
  const baseConfig = new Configuration({
    basePath: 'https://advertising-api.amazon.com',
    accessToken: getAccessToken,
  });
  return {
    campaigns: new v1.CampaignsApi(baseConfig),
  };
}

async function main() {
  const client = await createAdClient();

  try {
    const unique = "INSERT_UNIQUE_WORD";

    // 1. Create campaign using CampaignCreate model
    const baseCampaign: v1.CampaignCreate = {
      name: `Base Campaign + ${unique}`,
      adProduct: v1.AdProduct.SponsoredProducts,
      state: 'PAUSED',
      marketplaceScope: v1.MarketplaceScope.SingleMarketplace,
      marketplaces: [v1.Marketplace.Us],
      autoCreationSettings: { autoCreateTargets: true },
      startDateTime: new Date(),
      budgets: [{
        budgetType: v1.BudgetType.Monetary,
        recurrenceTimePeriod: v1.Recurrence.Daily,
        budgetValue: {
          monetaryBudgetValue: {
            monetaryBudget: { value: 1000 },
          },
        }
      }],
    };
    const baseResponse = await client.campaigns.createCampaign({
      amazonAdsClientId: CLIENT_ID,
      amazonAdvertisingAPIScope: PROFILE_ID,
      createCampaignRequest: { campaigns: [baseCampaign] }
    }).catch(e => {
      if (e.response) {
        console.log("Status: " + e.response.status);
        e.response.json().then((err: ResponseError) => {
          console.log("Message: " + err.message);
        });
      }
    });
    console.log('\n\nBase Campaign Response:\n', JSON.stringify(baseResponse, null, 2));

    // 2. Create campaign using SB Campaign model
    const sbCampaign: v1_sb.SBCampaignCreate = {
      name: `Sponsored Brands Campaign + ${unique}`,
      adProduct: v1_sb.SBAdProduct.SponsoredBrands,
      state: 'PAUSED',
      startDateTime: new Date(),
      budgets: [{
        budgetType: v1_sb.SBBudgetType.Monetary,
        recurrenceTimePeriod: v1_sb.SBRecurrence.Daily,
        budgetValue: {
          monetaryBudgetValue: {
            monetaryBudget: { value: 1000 },
          },
        }
      }],
      costType: 'CPC',
      marketplaceScope: v1_sb.SBMarketplaceScope.SingleMarketplace,
      marketplaces: [v1_sb.SBMarketplace.Us],
      brandId: "A1QZPEZHREUOON",
      optimizations: {
        goalSettings: { kpi: v1_sb.SBKPI.Clicks }
      }
    };
    const sbResponse = await client.campaigns.createCampaign({
      amazonAdsClientId: CLIENT_ID,
      amazonAdvertisingAPIScope: PROFILE_ID,
      createCampaignRequest: { campaigns: [sbCampaign] }
    }).catch(e => {
      if (e.response) {
        console.log("Status: " + e.response.status);
        e.response.json().then((err: ResponseError) => {
          console.log("Message: " + err.message);
        });
      }
    });
    console.log('\n\nSB Campaign Response:\n', JSON.stringify(sbResponse, null, 2));

    // 3. Create campaign using SP Campaign model
    const spCampaign: v1_sp.SPCampaignCreate = {
      name: `Sponsored Products Campaign + ${unique}`,
      adProduct: v1_sp.SPAdProduct.SponsoredProducts,
      state: 'PAUSED',
      startDateTime: new Date(),
      budgets: [{
        budgetType: v1_sp.SPBudgetType.Monetary,
        recurrenceTimePeriod: v1_sp.SPRecurrence.Daily,
        budgetValue: {
          monetaryBudgetValue: {
            monetaryBudget: { value: 1000 },
          },
        }
      }],
      marketplaceScope: v1_sp.SPMarketplaceScope.SingleMarketplace,
      marketplaces: [v1_sp.SPMarketplace.Us],
      autoCreationSettings: { autoCreateTargets: true },
    };
    const spResponse = await client.campaigns.createCampaign({
      amazonAdsClientId: CLIENT_ID,
      amazonAdvertisingAPIScope: PROFILE_ID,
      createCampaignRequest: { campaigns: [spCampaign] }
    }).catch(e => {
      if (e.response) {
        console.log("Status: " + e.response.status);
        e.response.json().then((err: ResponseError) => {
          console.log("Message: " + err.message);
        });
      }
    });
    console.log('\n\nSP Campaign Response:\n', JSON.stringify(spResponse, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
```

#### Step 3c: Create Configuration Files

**`amazon-ads-client-demo/package.json`:**

```json
{
  "name": "amazon-ads-client-demo",
  "version": "1.0.0",
  "engines": { "node": ">=20.0.0" },
  "engineStrict": true,
  "type": "module",
  "main": "dist/src/client.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/src/client.js",
    "dev": "ts-node --esm src/client.ts"
  },
  "dependencies": {
    "@types/node": "^24.0.14",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3",
    "amazon-ads-library-demo": "^1.0.0",
    "axios": "^1.11.0"
  }
}
```

**`amazon-ads-client-demo/tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

#### Step 3d: Build and Test the Client

Install dependencies (first time only):

```bash
npm install
```

Build the client:

```bash
npm run build
```

Run the client:

```bash
npm run start
```

> **Note:** Sponsored Products campaign creation requires a unique campaign name. Replace `"INSERT_UNIQUE_WORD"` in `client.ts` with a unique value for each test run, then rebuild.

---

### Step 4: Expected Response

A successful run produces output similar to the following:

```json
// Base Campaign Response
{
  "success": [
    {
      "index": 0,
      "campaign": {
        "marketplaces": ["US"],
        "autoCreationSettings": { "autoCreateTargets": true },
        "state": "PAUSED",
        "adProduct": "SPONSORED_PRODUCTS",
        "campaignId": "449940118618577",
        "name": "Base Campaign",
        "marketplaceScope": "SINGLE_MARKETPLACE",
        "budgets": [{
          "budgetType": "MONETARY",
          "recurrenceTimePeriod": "DAILY",
          "budgetValue": {
            "monetaryBudgetValue": {
              "monetaryBudget": { "currencyCode": "USD", "value": 1000 }
            }
          }
        }]
      }
    }
  ],
  "partialSuccess": [],
  "error": []
}
```

---

### Next Steps

For each OpenAPI specification input, the generated client library exports an object containing both appropriate models and a set of API classes corresponding to resources in the specification. Each API class includes methods corresponding to available operations in the API.

For example:
- `v1.CampaignsApi` → `.createCampaign()`, `.queryCampaign()`, `.updateCampaign()`, etc.
- `v1.AdGroupsApi` → `.createAdGroup()`, `.queryAdGroup()`, `.updateAdGroup()`, etc.

You can adjust `client.ts` to experiment with other resources and operations, then use this client library in your custom implementation as required.

---

*Documentation sourced from Amazon Ads Advanced Tools Center.*  
*© 2023 Amazon.com, Inc. or its affiliates.*
