// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
  CesteralToolAnnotations,
  CesteralWriteToolAnnotations,
  CesteralReadToolAnnotations,
  NormalizedEntitySnapshot,
  CanonicalEntityKind,
  DryRunResult,
  ToolDefinition,
} from "../../src/index.js";

describe("CesteralToolAnnotations", () => {
  it("accepts a minimal valid write value with only required fields", () => {
    const value: CesteralToolAnnotations = {
      kind: "write",
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      operation: ["pause"],
      entityKinds: ["campaign"],
      entityIdArgs: ["entityId"],
      readPartner: { toolName: "meta_get_entity", argMap: { entityId: "entityId" } },
      schemaVersion: 1,
      contractId: "meta.update_entity.v1",
      requiresValidation: true,
      requiresSimulation: true,
    };
    expectTypeOf(value).toMatchTypeOf<CesteralToolAnnotations>();
  });

  it("accepts a multi-operation write tool that dispatches by input args", () => {
    const value: CesteralToolAnnotations = {
      kind: "write",
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "update_entity",
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["entityId"],
      readPartner: { toolName: "meta_get_entity", argMap: { entityId: "entityId" } },
      schemaVersion: 1,
      contractId: "meta.update_entity.v1",
      supportsDryRun: false,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    };
    expectTypeOf(value).toMatchTypeOf<CesteralToolAnnotations>();
  });

  it("accepts a read tool with no operation or readPartner", () => {
    const value: CesteralToolAnnotations = {
      kind: "read",
      platform: "meta_ads",
      contractPlatformSlug: "meta",
      contractToolSlug: "get_entity",
      entityKinds: ["campaign", "ad_set", "ad"],
      entityIdArgs: ["entityId"],
      schemaVersion: 1,
      contractId: "meta.get_entity.v1",
    };
    expectTypeOf(value).toMatchTypeOf<CesteralToolAnnotations>();
  });

  it("constrains write operations to the canonical union", () => {
    expectTypeOf<CesteralWriteToolAnnotations["operation"][number]>().toEqualTypeOf<
      "update_budget" | "pause" | "resume" | "update_status" | "create" | "update"
    >();
  });

  it("read annotations carry no operation field", () => {
    expectTypeOf<CesteralReadToolAnnotations>().not.toHaveProperty("operation");
    expectTypeOf<CesteralReadToolAnnotations>().not.toHaveProperty("readPartner");
  });

  it("reuses CanonicalEntityKind from the snapshot module so annotations and snapshots stay in lockstep", () => {
    expectTypeOf<
      CesteralToolAnnotations["entityKinds"][number]
    >().toEqualTypeOf<CanonicalEntityKind>();
  });

  it("accepts insertion_order so DV360 InsertionOrder writes can be annotated without weakening the type", () => {
    const value: CesteralToolAnnotations = {
      kind: "write",
      platform: "dv360",
      contractPlatformSlug: "dv360",
      contractToolSlug: "update_entity",
      operation: ["update_budget", "pause", "resume", "update_status", "update"],
      entityKinds: ["insertion_order", "line_item", "campaign"],
      entityIdArgs: ["insertionOrderId", "lineItemId", "campaignId", "advertiserId"],
      readPartner: {
        toolName: "dv360_get_entity",
        argMap: {
          insertionOrderId: "insertionOrderId",
          lineItemId: "lineItemId",
          campaignId: "campaignId",
          advertiserId: "advertiserId",
        },
      },
      schemaVersion: 1,
      contractId: "dv360.update_entity.v1",
      requiresValidation: true,
      requiresSimulation: true,
    };
    expectTypeOf(value).toMatchTypeOf<CesteralToolAnnotations>();
  });
});

describe("NormalizedEntitySnapshot", () => {
  it("locks schemaVersion to 1 so consumers can pin against drift", () => {
    expectTypeOf<NormalizedEntitySnapshot["schemaVersion"]>().toEqualTypeOf<1>();
  });

  it("accepts a campaign snapshot with daily budget", () => {
    const snap: NormalizedEntitySnapshot = {
      schemaVersion: 1,
      platform: "meta_ads",
      entityKind: "campaign",
      platformEntityId: "1234567890",
      displayName: "Spring sale",
      accountId: "act_999",
      status: { canonical: "active", platformRaw: "ACTIVE" },
      budget: {
        daily: { amountMinor: 5000, currency: "USD" },
        lifetime: null,
      },
      schedule: { startAt: "2026-05-01T00:00:00Z", endAt: null },
    };
    expectTypeOf(snap).toMatchTypeOf<NormalizedEntitySnapshot>();
  });

  it("accepts a DV360 insertion order with flighted budget segments", () => {
    const snap: NormalizedEntitySnapshot = {
      schemaVersion: 1,
      platform: "dv360",
      entityKind: "insertion_order",
      platformEntityId: "io-42",
      displayName: null,
      accountId: "advertiser-1",
      status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
      budget: {
        daily: null,
        lifetime: { amountMinor: 100_000_00, currency: "EUR" },
        segments: [
          { amountMinor: 50_000_00, currency: "EUR", startAt: "2026-05-01", endAt: "2026-05-15" },
          { amountMinor: 50_000_00, currency: "EUR", startAt: "2026-05-16", endAt: "2026-05-31" },
        ],
      },
      schedule: { startAt: "2026-05-01", endAt: "2026-05-31" },
    };
    expectTypeOf(snap).toMatchTypeOf<NormalizedEntitySnapshot>();
  });
});

describe("DryRunResult", () => {
  it("tags validation and expected-state sources independently", () => {
    expectTypeOf<DryRunResult["validationSource"]>().toEqualTypeOf<
      "native_validator" | "symbolic" | "none"
    >();
    expectTypeOf<DryRunResult["expectedStateSource"]>().toEqualTypeOf<
      "native_simulator" | "server_symbolic_apply" | "none"
    >();
  });

  it("accepts a both-native success result", () => {
    const result: DryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "native_validator",
      expectedStateSource: "native_simulator",
      expectedPostState: {
        schemaVersion: 1,
        platform: "dv360",
        entityKind: "line_item",
        platformEntityId: "li-1",
        displayName: null,
        accountId: null,
        status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
        budget: {},
        schedule: { startAt: null, endAt: null },
      },
    };
    expectTypeOf(result).toMatchTypeOf<DryRunResult>();
  });

  it("accepts a validator-only result with no expected post-state", () => {
    const result: DryRunResult = {
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "native_validator",
      expectedStateSource: "none",
    };
    expectTypeOf(result).toMatchTypeOf<DryRunResult>();
  });

  it("accepts a failure with structured validation errors", () => {
    const result: DryRunResult = {
      wouldSucceed: false,
      validationErrors: [
        {
          code: "BUDGET_BELOW_MIN",
          message: "Daily budget must be at least 100 cents",
          field: "dailyBudget",
        },
      ],
      validationSource: "symbolic",
      expectedStateSource: "none",
    };
    expectTypeOf(result).toMatchTypeOf<DryRunResult>();
  });
});

describe("ToolDefinition.cesteral", () => {
  it("accepts an optional cesteral annotation block", () => {
    const def: ToolDefinition<
      z.ZodObject<{ entityId: z.ZodString }>,
      z.ZodObject<{ ok: z.ZodBoolean }>
    > = {
      name: "meta_pause_entity",
      title: "Pause Meta entity",
      description: "Pause a campaign or ad set.",
      inputSchema: z.object({ entityId: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        cesteral: {
          kind: "write",
          platform: "meta_ads",
          contractPlatformSlug: "meta",
          contractToolSlug: "update_entity",
          operation: ["pause"],
          entityKinds: ["campaign", "ad_set"],
          entityIdArgs: ["entityId"],
          readPartner: { toolName: "meta_get_entity", argMap: { entityId: "entityId" } },
          schemaVersion: 1,
          contractId: "meta.update_entity.v1",
          supportsDryRun: true,
          supportsBeforeAfterSnapshot: true,
          requiresValidation: true,
          requiresSimulation: true,
        },
      },
      logic: async () => ({ ok: true }),
    };
    expectTypeOf(def.annotations?.cesteral).toMatchTypeOf<CesteralToolAnnotations | undefined>();
  });

  it("permits annotations without cesteral (back-compat)", () => {
    const def: ToolDefinition<
      z.ZodObject<Record<string, never>>,
      z.ZodObject<Record<string, never>>
    > = {
      name: "noop",
      title: "Noop",
      description: "",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      logic: async () => ({}),
    };
    expectTypeOf(def.annotations?.cesteral).toMatchTypeOf<CesteralToolAnnotations | undefined>();
  });
});
