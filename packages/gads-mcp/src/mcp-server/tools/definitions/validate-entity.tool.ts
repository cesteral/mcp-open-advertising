import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type GAdsEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "gads_validate_entity";
const TOOL_TITLE = "Google Ads Entity Validation (Dry Run)";
const TOOL_DESCRIPTION = `Validate an entity payload without creating or modifying it. Uses Google Ads \`validateOnly\` mode for true server-side validation.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Sends the payload to the Google Ads :mutate endpoint with \`validateOnly: true\`, which performs full server-side validation without any side effects.

**Modes:**
- **create**: Validates a create operation payload
- **update**: Validates an update operation payload (requires \`entityId\` and \`updateMask\`)

**Composite entityId required for:** \`ad\` -> use \`{adGroupId}~{adId}\`, \`keyword\` -> use \`{adGroupId}~{criterionId}\`. Other entity types use simple IDs.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    customerId: z
      .string()
      .min(1)
      .describe("Google Ads customer ID (no dashes)"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode: 'create' for new entity, 'update' for existing"),
    data: z
      .record(z.any())
      .describe(
        "Entity data payload to validate (fields vary by entity type — see entity-schema resources)"
      ),
    entityId: z
      .string()
      .optional()
      .describe("Entity ID (required for update mode)"),
    updateMask: z
      .string()
      .optional()
      .describe(
        "Comma-separated list of fields to update (required for update mode, e.g., 'name,status')"
      ),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "update") {
      if (!input.entityId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "entityId is required when mode is 'update'",
          path: ["entityId"],
        });
      }
      if (!input.updateMask) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "updateMask is required when mode is 'update'",
          path: ["updateMask"],
        });
      }
    }
  })
  .describe("Parameters for validating a Google Ads entity payload (dry run)");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z
      .array(z.string())
      .optional()
      .describe("Validation error messages (present when valid is false)"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const { gadsService } = resolveSessionServices(sdkContext);

  const result = await gadsService.validateEntity(
    input.entityType as GAdsEntityType,
    input.customerId,
    input.data,
    input.mode as "create" | "update",
    input.entityId,
    input.updateMask,
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

export function validateEntityResponseFormatter(
  result: ValidateEntityOutput
): any {
  if (result.valid) {
    return [
      {
        type: "text" as const,
        text: `Validation passed for ${result.entityType} (${result.mode})\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Validation failed for ${result.entityType} (${result.mode})\n\nErrors:\n${result.errors?.map((e) => `  - ${e}`).join("\n") ?? "Unknown error"}\n\nTimestamp: ${result.timestamp}`,
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
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Validate a new campaign (create mode)",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        mode: "create",
        data: {
          name: "Test Campaign",
          advertisingChannelType: "SEARCH",
          status: "PAUSED",
          campaignBudget: "customers/1234567890/campaignBudgets/5678",
        },
      },
    },
    {
      label: "Validate a campaign update",
      input: {
        entityType: "campaign",
        customerId: "1234567890",
        mode: "update",
        entityId: "123456",
        data: {
          name: "Updated Campaign",
        },
        updateMask: "name",
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
