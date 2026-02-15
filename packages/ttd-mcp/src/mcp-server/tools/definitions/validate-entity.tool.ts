import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "../../../utils/internal/request-context.js";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "ttd_validate_entity";
const TOOL_TITLE = "Validate TTD Entity";
const TOOL_DESCRIPTION = `Validate a TTD entity payload without persisting it (dry-run mode).

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Sends the payload to the TTD API and reports whether it would succeed or what validation errors exist. Useful for:
- Pre-flight checks before creating/updating entities
- Schema discovery — see what fields TTD expects or rejects
- Debugging 400 errors by testing payloads incrementally

**Note:** In create mode, if validation succeeds the entity IS created (TTD has no native dry-run). In update mode, the entity IS updated. Use this tool primarily to diagnose validation failures.`;

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
    openWorldHint: false,
    idempotentHint: false,
  },
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
