import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_validate_entity";
const TOOL_TITLE = "Validate TTD Entity";
const TOOL_DESCRIPTION = `Test a TTD entity payload against the TTD API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Sends the payload to the TTD API and reports whether it succeeds or what validation errors exist.

**WARNING: This is NOT a true dry-run.** TTD has no native dry-run/validate-only mode:
- In **create** mode, a successful call **CREATES** the entity.
- In **update** mode, a successful call **UPDATES** the entity.

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

  const result = await ttdService.validateEntity(
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

export function validateEntityResponseFormatter(result: ValidateOutput): any {
  if (result.valid) {
    return [
      {
        type: "text" as const,
        text: `✓ Validation passed for ${result.entityType} (${result.mode})\n\nTimestamp: ${result.timestamp}`,
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
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
