import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { McpTextContent, RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_validate_entity";
const TOOL_TITLE = "Validate TTD Entity";
const TOOL_DESCRIPTION = `⚠️ WARNING: This tool makes REAL API calls — it is NOT a safe dry-run. Successful calls WILL create or update real entities in TTD.

Test a TTD entity payload against the TTD API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Sends the payload to the TTD API and reports whether it succeeds or what validation errors exist.

**Why this is not a dry-run:** TTD has no native dry-run/validate-only mode:
- In **create** mode, a successful call **CREATES** the entity (permanent side effect).
- In **update** mode, a successful call **UPDATES** the entity (permanent side effect).

Use this tool primarily to **diagnose validation failures** (400 errors) by testing payloads incrementally. If the call succeeds, the side effect has already occurred.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode: 'create' for new entity, 'update' for existing"),
    entityId: z
      .string()
      .optional()
      .describe("Entity ID (required for update mode)"),
    data: z
      .record(z.any())
      .describe("Entity data payload to validate"),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "update" && !val.entityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "entityId is required when mode is 'update' — without it the request would fall through to a create operation",
        path: ["entityId"],
      });
    }
  })
  .describe("Parameters for validating a TTD entity payload");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload is valid"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).optional().describe("Validation error messages"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ValidateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const result = await ttdService.testCreateOrUpdate(
    input.entityType as TtdEntityType,
    input.data,
    input.mode as "create" | "update",
    input.entityId,
    context
  );

  return {
    valid: result.valid,
    entityType: input.entityType,
    mode: input.mode,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  };
}

export function validateEntityResponseFormatter(result: ValidateOutput): McpTextContent[] {
  if (result.valid) {
    return [
      {
        type: "text" as const,
        text: `PASS Validation passed for ${result.entityType} (${result.mode})\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `✗ Validation failed for ${result.entityType} (${result.mode})\n\nErrors:\n${result.errors?.map((e) => `  - ${e}`).join("\n") ?? "Unknown error"}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const validateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateEntityInputSchema,
  outputSchema: ValidateEntityOutputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "⚠️ Test a new campaign payload (WILL create entity if valid)",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          AdvertiserId: "adv123abc",
          CampaignName: "Q1 2025 Brand Awareness",
          Budget: { Amount: 50000, CurrencyCode: "USD" },
          StartDate: "2025-01-01T00:00:00Z",
          EndDate: "2025-03-31T23:59:59Z",
          PacingMode: "PaceEvenly",
        },
      },
    },
    {
      label: "⚠️ Test an ad group update payload (WILL update entity if valid)",
      input: {
        entityType: "adGroup",
        mode: "update",
        entityId: "adg111aaa",
        data: {
          AdvertiserId: "adv123abc",
          CampaignId: "camp456def",
          AdGroupName: "Prospecting - Display",
          RTBAttributes: {
            BudgetSettings: { DailyBudget: { Amount: 750, CurrencyCode: "USD" } },
            BaseBidCPM: { Amount: 5.0, CurrencyCode: "USD" },
          },
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
