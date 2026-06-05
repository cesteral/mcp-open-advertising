// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  McpError,
  JsonRpcErrorCode,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_manage_seed";
const TOOL_TITLE = "TTD Manage Seed";
const TOOL_DESCRIPTION = `Manage audience seed segments in The Trade Desk via GraphQL.

Supports creating, updating, and retrieving seed definitions, setting a default seed for an advertiser, and attaching/detaching a seed from a campaign.

### Operations
- **create** — Create a new audience seed for an advertiser (requires \`advertiserId\` + \`data\`)
- **update** — Update an existing seed's properties (requires \`seedId\` + \`data\`)
- **get** — Retrieve seed details including quality and active ID count (requires \`seedId\`)
- **set_default_advertiser** — Set a seed as the default for an advertiser (requires \`advertiserId\` + \`seedId\`)
- **attach_to_campaign** — Attach or detach a seed from a campaign (requires \`campaignId\` + \`seedId\`; set \`seedId\` to null in \`data\` to detach)

### Notes
- Seed quality and activeSeedIdCount are available on the \`get\` operation
- Use \`ttd_graphql_query\` for advanced seed queries not covered by this tool`;

const SEED_CREATE_MUTATION = `mutation SeedCreate($input: SeedCreateInput!) {
  seedCreate(input: $input) {
    data {
      id
      name
      status
      quality
    }
    userErrors {
      field
      message
    }
  }
}`;

const SEED_UPDATE_MUTATION = `mutation SeedUpdate($input: SeedUpdateInput!) {
  seedUpdate(input: $input) {
    data {
      id
      name
      status
    }
    userErrors {
      field
      message
    }
  }
}`;

const ADVERTISER_SET_DEFAULT_SEED_MUTATION = `mutation AdvertiserSetDefaultSeed($input: AdvertiserSetDefaultSeedInput!) {
  advertiserSetDefaultSeed(input: $input) {
    data {
      id
    }
    userErrors {
      field
      message
    }
  }
}`;

const CAMPAIGN_UPDATE_SEED_MUTATION = `mutation CampaignUpdateSeed($input: CampaignUpdateSeedInput!) {
  campaignUpdateSeed(input: $input) {
    data {
      id
    }
    userErrors {
      field
      message
    }
  }
}`;

const GET_SEED_QUERY = `query GetSeed($id: ID!) {
  seed(id: $id) {
    id
    name
    status
    quality
    activeSeedIdCount
  }
}`;

export const ManageSeedInputSchema = z
  .object({
    operation: z
      .enum(["create", "update", "get", "set_default_advertiser", "attach_to_campaign"])
      .describe("Seed management operation to perform"),
    seedId: z
      .string()
      .optional()
      .describe("Required for update, get, set_default_advertiser, attach_to_campaign"),
    advertiserId: z.string().optional().describe("Required for create and set_default_advertiser"),
    campaignId: z.string().optional().describe("Required for attach_to_campaign"),
    data: z
      .record(z.any())
      .optional()
      .describe("Seed payload for create/update (name, description, etc.)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the operation and returns an EffectDryRunResult under `dryRun` (expected effect = the seed operation) without calling the TTD API. No seed is changed."
      ),
  })
  .superRefine((val, ctx) => {
    if (
      (val.operation === "update" ||
        val.operation === "get" ||
        val.operation === "set_default_advertiser" ||
        val.operation === "attach_to_campaign") &&
      !val.seedId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "seedId is required for this operation",
        path: ["seedId"],
      });
    }
    if (val.operation === "create" && !val.advertiserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "advertiserId is required for create",
        path: ["advertiserId"],
      });
    }
    if (val.operation === "create" && !val.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "data is required for create",
        path: ["data"],
      });
    }
    if (val.operation === "set_default_advertiser" && !val.advertiserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "advertiserId is required for set_default_advertiser",
        path: ["advertiserId"],
      });
    }
    if (val.operation === "attach_to_campaign" && !val.campaignId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "campaignId is required for attach_to_campaign",
        path: ["campaignId"],
      });
    }
  });

export const ManageSeedOutputSchema = z.object({
  operation: z.string().describe("The operation that was performed"),
  seedId: z.string().optional().describe("ID of the seed affected"),
  result: z.record(z.any()).optional().describe("Data returned by the API"),
  timestamp: z.string().datetime(),
  dryRun: EffectDryRunResultSchema.optional().describe(
    "Present only when the request was made with `dry_run: true`. No seed was changed."
  ),
  effect: EffectResultSchema.optional().describe(
    "Effect-class result identity (effectKind `seed_managed` + scalar audit summary incl. the sub-operation). Present on a confirmed execute."
  ),
  dispatchedCapability: DispatchedCapabilitySchema.describe(
    "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class; a seed is not a canonical entity). Present on every response."
  ),
});

type ManageSeedInput = z.infer<typeof ManageSeedInputSchema>;
type ManageSeedOutput = z.infer<typeof ManageSeedOutputSchema>;

function throwIfUserErrors(userErrors: unknown[], defaultMessage: string): void {
  if (userErrors.length === 0) return;
  const messages = userErrors.map((e: any) => e.message ?? JSON.stringify(e)).join("; ");
  throw new McpError(JsonRpcErrorCode.InvalidParams, `${defaultMessage}: ${messages}`, {
    userErrors,
  });
}

export async function manageSeedLogic(
  input: ManageSeedInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ManageSeedOutput> {
  const timestamp = new Date().toISOString();

  // Effect-class write: a seed is not a canonical entity, so there is no
  // before/after snapshot — the operation is governed as a single effect.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  if (input.dry_run === true) {
    return {
      operation: input.operation,
      seedId: input.seedId,
      timestamp,
      dryRun: buildSeedEffectDryRun(input.operation),
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  let seedId: string | undefined;
  let resultData: Record<string, any> | undefined;

  switch (input.operation) {
    case "create": {
      const result = (await ttdService.graphqlQuery(
        SEED_CREATE_MUTATION,
        { input: { advertiserId: input.advertiserId, ...input.data } },
        context
      )) as Record<string, any>;

      throwIfGraphqlErrors(result, "Failed to create seed");

      const payload = result.data?.seedCreate;
      throwIfUserErrors(payload?.userErrors ?? [], "Seed creation failed");

      const seedData = payload?.data as Record<string, any>;
      seedId = seedData?.id as string | undefined;
      resultData = seedData;
      break;
    }

    case "update": {
      const result = (await ttdService.graphqlQuery(
        SEED_UPDATE_MUTATION,
        { input: { id: input.seedId, ...input.data } },
        context
      )) as Record<string, any>;

      throwIfGraphqlErrors(result, "Failed to update seed");

      const payload = result.data?.seedUpdate;
      throwIfUserErrors(payload?.userErrors ?? [], "Seed update failed");

      const seedData = payload?.data as Record<string, any>;
      seedId = (seedData?.id ?? input.seedId) as string | undefined;
      resultData = seedData;
      break;
    }

    case "get": {
      const result = (await ttdService.graphqlQuery(
        GET_SEED_QUERY,
        { id: input.seedId },
        context
      )) as Record<string, any>;

      throwIfGraphqlErrors(result, "Failed to get seed");

      const seedData = result.data?.seed as Record<string, any>;
      seedId = (seedData?.id ?? input.seedId) as string | undefined;
      resultData = seedData;
      break;
    }

    case "set_default_advertiser": {
      const result = (await ttdService.graphqlQuery(
        ADVERTISER_SET_DEFAULT_SEED_MUTATION,
        { input: { advertiserId: input.advertiserId, seedId: input.seedId } },
        context
      )) as Record<string, any>;

      throwIfGraphqlErrors(result, "Failed to set default seed");

      const payload = result.data?.advertiserSetDefaultSeed;
      throwIfUserErrors(payload?.userErrors ?? [], "Set default seed failed");

      seedId = input.seedId;
      resultData = payload?.data as Record<string, any>;
      break;
    }

    case "attach_to_campaign": {
      const result = (await ttdService.graphqlQuery(
        CAMPAIGN_UPDATE_SEED_MUTATION,
        { input: { campaignId: input.campaignId, seedId: input.seedId } },
        context
      )) as Record<string, any>;

      throwIfGraphqlErrors(result, "Failed to attach seed to campaign");

      const payload = result.data?.campaignUpdateSeed;
      throwIfUserErrors(payload?.userErrors ?? [], "Campaign seed attachment failed");

      seedId = input.seedId;
      resultData = payload?.data as Record<string, any>;
      break;
    }
  }

  // Effect summary carries audit identity only (sub-operation + seed id) —
  // never the raw `data` payload.
  const effect: EffectResult = {
    effectKind: "seed_managed",
    summary: { operation: input.operation, ...(seedId ? { seed_id: seedId } : {}) },
  };

  return {
    operation: input.operation,
    seedId,
    result: resultData,
    timestamp,
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `ttd_manage_seed`. Per-operation required fields
 * (seedId / advertiserId / campaignId / data) are enforced by the input
 * schema's superRefine, so a well-formed call always passes; the projected
 * effect is the seed operation. Pure (no I/O); never includes the raw `data`.
 */
function buildSeedEffectDryRun(operation: ManageSeedInput["operation"]): EffectDryRunResult {
  const expectedEffect: EffectResult = {
    effectKind: "seed_managed",
    summary: { operation },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function manageSeedResponseFormatter(result: ManageSeedOutput): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationSource, expectedEffectSource } = result.dryRun;
    return [
      {
        type: "text" as const,
        text: `Dry run: seed ${result.operation} ${wouldSucceed ? "would succeed" : "would FAIL"} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No seed was changed.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines: string[] = [];

  switch (result.operation) {
    case "create":
      lines.push(`Seed created successfully.`);
      if (result.seedId) lines.push(`Seed ID: ${result.seedId}`);
      break;
    case "update":
      lines.push(`Seed updated successfully.`);
      if (result.seedId) lines.push(`Seed ID: ${result.seedId}`);
      break;
    case "get": {
      lines.push(`Seed details retrieved.`);
      if (result.seedId) lines.push(`Seed ID: ${result.seedId}`);
      const r = result.result ?? {};
      if (r.name) lines.push(`Name: ${r.name}`);
      if (r.status) lines.push(`Status: ${r.status}`);
      if (r.quality) lines.push(`Quality: ${r.quality}`);
      if (r.activeSeedIdCount !== undefined)
        lines.push(`Active Seed ID Count: ${r.activeSeedIdCount}`);
      break;
    }
    case "set_default_advertiser":
      lines.push(`Default seed set for advertiser.`);
      if (result.seedId) lines.push(`Seed ID: ${result.seedId}`);
      break;
    case "attach_to_campaign":
      lines.push(`Seed attached to campaign.`);
      if (result.seedId) lines.push(`Seed ID: ${result.seedId}`);
      if (result.result?.id) lines.push(`Campaign ID: ${result.result.id}`);
      break;
    default:
      lines.push(`Operation "${result.operation}" completed.`);
  }

  if (result.result) {
    lines.push(`\nRaw result:\n${JSON.stringify(result.result, null, 2)}`);
  }

  lines.push(`\nTimestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const manageSeedTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ManageSeedInputSchema,
  outputSchema: ManageSeedOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "manage_seed",
      operation: ["manage"],
      entityKinds: [],
      entityIdArgs: ["seedId"],
      schemaVersion: 1,
      contractId: "ttd.manage_seed.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Create a new audience seed",
      input: {
        operation: "create",
        advertiserId: "adv123abc",
        data: { name: "High-Value Users", description: "Retargeting seed for high-value visitors" },
      },
    },
    {
      label: "Get seed details",
      input: {
        operation: "get",
        seedId: "seed456def",
      },
    },
    {
      label: "Set default seed for an advertiser",
      input: {
        operation: "set_default_advertiser",
        advertiserId: "adv123abc",
        seedId: "seed456def",
      },
    },
    {
      label: "Attach seed to a campaign",
      input: {
        operation: "attach_to_campaign",
        campaignId: "camp789ghi",
        seedId: "seed456def",
      },
    },
  ],
  logic: manageSeedLogic,
  responseFormatter: manageSeedResponseFormatter,
};
