import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");

const updateEntitySurfaces = [
  {
    packageDir: "amazon-dsp-mcp",
    platformSlug: "amazon_dsp",
    writeTool: "amazon_dsp_update_entity",
    readTool: "amazon_dsp_get_entity",
    pairs: {
      pause: ["line_item", "order"],
      resume: ["line_item", "order"],
      update_budget: ["line_item", "order"],
    },
  },
  {
    packageDir: "cm360-mcp",
    platformSlug: "cm360",
    writeTool: "cm360_update_entity",
    readTool: "cm360_get_entity",
    pairs: {
      pause: ["ad"],
      resume: ["ad"],
      update_status: ["ad", "campaign"],
    },
  },
  {
    packageDir: "dv360-mcp",
    platformSlug: "dv360",
    writeTool: "dv360_update_entity",
    readTool: "dv360_get_entity",
    pairs: {
      pause: ["insertion_order", "line_item"],
      resume: ["insertion_order", "line_item"],
      update_budget: ["insertion_order", "line_item"],
    },
  },
  {
    packageDir: "gads-mcp",
    platformSlug: "google_ads",
    writeTool: "gads_update_entity",
    readTool: "gads_get_entity",
    pairs: {
      pause: ["ad_group", "campaign"],
      resume: ["ad_group", "campaign"],
      update_budget: ["campaign_budget"],
    },
  },
  {
    packageDir: "linkedin-mcp",
    platformSlug: "linkedin_ads",
    writeTool: "linkedin_update_entity",
    readTool: "linkedin_get_entity",
    pairs: {
      pause: ["campaign"],
      resume: ["campaign"],
      update_budget: ["campaign"],
    },
  },
  {
    packageDir: "meta-mcp",
    platformSlug: "meta",
    writeTool: "meta_update_entity",
    readTool: "meta_get_entity",
    pairs: {
      pause: ["ad_set", "campaign"],
      resume: ["ad_set", "campaign"],
      update_budget: ["ad_set", "campaign"],
    },
  },
  {
    packageDir: "msads-mcp",
    platformSlug: "msads",
    writeTool: "msads_update_entity",
    readTool: "msads_get_entity",
    pairs: {
      pause: ["ad", "ad_group", "campaign"],
      resume: ["ad", "ad_group", "campaign"],
      update_budget: ["campaign", "campaign_budget"],
    },
  },
  {
    packageDir: "pinterest-mcp",
    platformSlug: "pinterest",
    writeTool: "pinterest_update_entity",
    readTool: "pinterest_get_entity",
    pairs: {
      pause: ["ad", "ad_group", "campaign"],
      resume: ["ad", "ad_group", "campaign"],
      update_budget: ["ad_group", "campaign"],
    },
  },
  {
    packageDir: "snapchat-mcp",
    platformSlug: "snapchat",
    writeTool: "snapchat_update_entity",
    readTool: "snapchat_get_entity",
    pairs: {
      pause: ["ad", "ad_group", "campaign"],
      resume: ["ad", "ad_group", "campaign"],
      update_budget: ["ad_group", "campaign"],
    },
  },
  {
    packageDir: "tiktok-mcp",
    platformSlug: "tiktok",
    writeTool: "tiktok_update_entity",
    readTool: "tiktok_get_entity",
    pairs: {
      pause: ["ad", "ad_group", "campaign"],
      resume: ["ad", "ad_group", "campaign"],
      update_budget: ["ad_group", "campaign"],
    },
  },
  {
    packageDir: "ttd-mcp",
    platformSlug: "ttd",
    writeTool: "ttd_update_entity",
    readTool: "ttd_get_entity",
    pairs: {
      pause: ["ad_group", "campaign"],
      resume: ["ad_group", "campaign"],
      update_budget: ["campaign"],
    },
  },
];

const extraGovernedSurfaces = [
  {
    packageDir: "amazon-dsp-mcp",
    platformSlug: "amazon_dsp",
    writeTool: "amazon_dsp_update_commitment",
    readTool: "amazon_dsp_get_commitment",
    contractToolSlug: "update_commitment",
    readContractToolSlug: "get_commitment",
    pairs: { update: ["commitment"] },
  },
  {
    packageDir: "gads-mcp",
    platformSlug: "google_ads",
    writeTool: "gads_remove_entity",
    readTool: "gads_get_entity",
    contractToolSlug: "remove_entity",
    readContractToolSlug: "get_entity",
    pairs: { delete: ["campaign", "ad_group", "campaign_budget"] },
  },
  {
    packageDir: "gads-mcp",
    platformSlug: "google_ads",
    writeTool: "gads_create_entity",
    readTool: "gads_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group", "campaign_budget"] },
  },
  {
    packageDir: "meta-mcp",
    platformSlug: "meta",
    writeTool: "meta_delete_entity",
    readTool: "meta_get_entity",
    contractToolSlug: "delete_entity",
    readContractToolSlug: "get_entity",
    pairs: { delete: ["campaign", "ad_set", "ad"] },
  },
  {
    packageDir: "meta-mcp",
    platformSlug: "meta",
    writeTool: "meta_create_entity",
    readTool: "meta_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_set", "ad"] },
  },
  {
    packageDir: "meta-mcp",
    platformSlug: "meta",
    writeTool: "meta_duplicate_entity",
    readTool: "meta_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["campaign", "ad_set", "ad"] },
  },
  {
    packageDir: "dv360-mcp",
    platformSlug: "dv360",
    writeTool: "dv360_delete_entity",
    readTool: "dv360_get_entity",
    contractToolSlug: "delete_entity",
    readContractToolSlug: "get_entity",
    pairs: { delete: ["campaign", "insertion_order", "line_item"] },
  },
  {
    packageDir: "linkedin-mcp",
    platformSlug: "linkedin_ads",
    writeTool: "linkedin_delete_entity",
    readTool: "linkedin_get_entity",
    contractToolSlug: "delete_entity",
    readContractToolSlug: "get_entity",
    pairs: { delete: ["campaign"] },
  },
  {
    packageDir: "linkedin-mcp",
    platformSlug: "linkedin_ads",
    writeTool: "linkedin_create_entity",
    readTool: "linkedin_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign"] },
  },
  {
    packageDir: "tiktok-mcp",
    platformSlug: "tiktok",
    writeTool: "tiktok_create_entity",
    readTool: "tiktok_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group", "ad"] },
  },
  {
    packageDir: "snapchat-mcp",
    platformSlug: "snapchat",
    writeTool: "snapchat_create_entity",
    readTool: "snapchat_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group", "ad"] },
  },
  {
    packageDir: "pinterest-mcp",
    platformSlug: "pinterest",
    writeTool: "pinterest_create_entity",
    readTool: "pinterest_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group", "ad"] },
  },
  {
    packageDir: "msads-mcp",
    platformSlug: "msads",
    writeTool: "msads_create_entity",
    readTool: "msads_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group", "ad", "campaign_budget"] },
  },
  {
    packageDir: "amazon-dsp-mcp",
    platformSlug: "amazon_dsp",
    writeTool: "amazon_dsp_create_entity",
    readTool: "amazon_dsp_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["order", "line_item"] },
  },
  {
    packageDir: "ttd-mcp",
    platformSlug: "ttd",
    writeTool: "ttd_create_entity",
    readTool: "ttd_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad_group"] },
  },
  {
    packageDir: "dv360-mcp",
    platformSlug: "dv360",
    writeTool: "dv360_create_entity",
    readTool: "dv360_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "insertion_order", "line_item"] },
  },
  {
    packageDir: "cm360-mcp",
    platformSlug: "cm360",
    writeTool: "cm360_create_entity",
    readTool: "cm360_get_entity",
    contractToolSlug: "create_entity",
    readContractToolSlug: "get_entity",
    pairs: { create: ["campaign", "ad"] },
  },
  {
    packageDir: "linkedin-mcp",
    platformSlug: "linkedin_ads",
    writeTool: "linkedin_duplicate_entity",
    readTool: "linkedin_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["campaign"] },
  },
  {
    packageDir: "amazon-dsp-mcp",
    platformSlug: "amazon_dsp",
    writeTool: "amazon_dsp_duplicate_entity",
    readTool: "amazon_dsp_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["order", "line_item"] },
  },
  {
    packageDir: "pinterest-mcp",
    platformSlug: "pinterest",
    writeTool: "pinterest_duplicate_entity",
    readTool: "pinterest_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["campaign"] },
  },
  {
    packageDir: "tiktok-mcp",
    platformSlug: "tiktok",
    writeTool: "tiktok_duplicate_entity",
    readTool: "tiktok_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["campaign", "ad_group", "ad"] },
  },
  {
    packageDir: "dv360-mcp",
    platformSlug: "dv360",
    writeTool: "dv360_duplicate_entity",
    readTool: "dv360_get_entity",
    contractToolSlug: "duplicate_entity",
    readContractToolSlug: "get_entity",
    pairs: { duplicate: ["insertion_order", "line_item"] },
  },
];

const entityKindAliases = {
  ad_group: ["adGroup", "ad_group"],
  ad_set: ["adSet", "ad_set"],
  campaign_budget: ["campaignBudget", "campaign_budget", "budget"],
  insertion_order: ["insertionOrder", "insertion_order"],
  line_item: ["lineItem", "line_item"],
};

function readToolSource(packageDir, toolSlug) {
  const path = join(
    repoRoot,
    "packages",
    packageDir,
    "src/mcp-server/tools/definitions",
    `${toolSlug}.tool.ts`
  );
  expect(existsSync(path), `${path} exists`).toBe(true);
  return readFileSync(path, "utf8");
}

function readFixtureSource(packageDir) {
  const dir = join(repoRoot, "packages", packageDir, "src/testkit/fixtures");
  expect(existsSync(dir), `${dir} exists`).toBe(true);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(dir, name), "utf8"))
    .join("\n");
}

function expectIncludesField(source, key, value) {
  if (key === "name") {
    const literalName = `${key}: "${value}"`;
    const constantName = new RegExp(`const\\s+TOOL_NAME\\s*=\\s*"${value}"`);
    expect(source.includes(literalName) || constantName.test(source), `${key}: ${value}`).toBe(
      true
    );
    return;
  }

  expect(source, `${key}: ${value}`).toContain(`${key}: "${value}"`);
}

function expectIncludesContract(source, fields) {
  for (const [key, value] of Object.entries(fields)) {
    expectIncludesField(source, key, value);
  }
}

function expectIncludesBooleanContractPromise(source, key) {
  expect(source, `${key}: true`).toContain(`${key}: true`);
}

function expectFixturePair(source, operation, canonicalKind) {
  const aliases = entityKindAliases[canonicalKind] ?? [canonicalKind];
  const hasPair = aliases.some((kind) => {
    const operationIndex = source.indexOf(`operation: "${operation}"`);
    const kindIndex = source.indexOf(`entityKind: "${kind}"`);
    return operationIndex !== -1 && kindIndex !== -1;
  });
  expect(
    hasPair,
    `expected fixture pair ${operation} / ${canonicalKind} (aliases: ${aliases.join(", ")})`
  ).toBe(true);
}

function expectFixtureContractToolSlug(source, contractToolSlug, operation, canonicalKind) {
  const aliases = entityKindAliases[canonicalKind] ?? [canonicalKind];
  const hasFixture = aliases.some((kind) => {
    const fixturePattern = new RegExp(
      `contractToolSlug:\\s*"${contractToolSlug}"[\\s\\S]*?operation:\\s*"${operation}"[\\s\\S]*?entityKind:\\s*"${kind}"`
    );
    return fixturePattern.test(source);
  });
  expect(
    hasFixture,
    `expected fixture for ${contractToolSlug} / ${operation} / ${canonicalKind} (aliases: ${aliases.join(", ")})`
  ).toBe(true);
}

describe("governed contract release gate", () => {
  it.each(updateEntitySurfaces)(
    "$writeTool declares a governed update_entity write, read partner, and fixture coverage",
    (surface) => {
      const writeSource = readToolSource(surface.packageDir, "update-entity");
      const readSource = readToolSource(surface.packageDir, "get-entity");
      const fixtureSource = readFixtureSource(surface.packageDir);

      expectIncludesContract(writeSource, {
        name: surface.writeTool,
        kind: "write",
        contractPlatformSlug: surface.platformSlug,
        contractToolSlug: "update_entity",
        contractId: `${surface.platformSlug}.update_entity.v1`,
        toolName: surface.readTool,
      });
      expectIncludesBooleanContractPromise(writeSource, "supportsDryRun");
      expectIncludesBooleanContractPromise(writeSource, "supportsBeforeAfterSnapshot");
      expectIncludesBooleanContractPromise(writeSource, "requiresValidation");
      expectIncludesBooleanContractPromise(writeSource, "requiresSimulation");

      expectIncludesContract(readSource, {
        name: surface.readTool,
        kind: "read",
        contractPlatformSlug: surface.platformSlug,
        contractToolSlug: "get_entity",
        contractId: `${surface.platformSlug}.get_entity.v1`,
      });

      for (const [operation, entityKinds] of Object.entries(surface.pairs)) {
        for (const entityKind of entityKinds) {
          expectFixturePair(fixtureSource, operation, entityKind);
          expectFixtureContractToolSlug(fixtureSource, "update_entity", operation, entityKind);
        }
      }
    }
  );

  it.each(extraGovernedSurfaces)(
    "$writeTool declares an additional governed write surface and fixture coverage",
    (surface) => {
      const writeSource = readToolSource(
        surface.packageDir,
        surface.contractToolSlug.replaceAll("_", "-")
      );
      const readSource = readToolSource(
        surface.packageDir,
        surface.readContractToolSlug.replaceAll("_", "-")
      );
      const fixtureSource = readFixtureSource(surface.packageDir);

      expectIncludesContract(writeSource, {
        name: surface.writeTool,
        kind: "write",
        contractPlatformSlug: surface.platformSlug,
        contractToolSlug: surface.contractToolSlug,
        contractId: `${surface.platformSlug}.${surface.contractToolSlug}.v1`,
        toolName: surface.readTool,
      });
      expectIncludesBooleanContractPromise(writeSource, "supportsDryRun");
      expectIncludesBooleanContractPromise(writeSource, "supportsBeforeAfterSnapshot");
      expectIncludesBooleanContractPromise(writeSource, "requiresValidation");
      expectIncludesBooleanContractPromise(writeSource, "requiresSimulation");

      expectIncludesContract(readSource, {
        name: surface.readTool,
        kind: "read",
        contractPlatformSlug: surface.platformSlug,
        contractToolSlug: surface.readContractToolSlug,
        contractId: `${surface.platformSlug}.${surface.readContractToolSlug}.v1`,
      });

      for (const [operation, entityKinds] of Object.entries(surface.pairs)) {
        for (const entityKind of entityKinds) {
          expectFixturePair(fixtureSource, operation, entityKind);
          expectFixtureContractToolSlug(
            fixtureSource,
            surface.contractToolSlug,
            operation,
            entityKind
          );
        }
      }
    }
  );
});
