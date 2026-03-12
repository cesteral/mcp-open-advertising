import { z } from 'zod';
import { resolveSessionServices } from '../utils/resolve-session.js';
import { ALL_TARGETING_TYPES, type TargetingType } from '../utils/targeting-metadata.js';
import {
  getValidateInputShape,
  hasAnyEntityIds,
  getEntityIdsValidationError,
  getValidateIdsFieldName,
} from '../utils/targeting-input-shape.js';
import { getSupportedTargetingParentTypes } from '../utils/targeting-metadata.js';
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from '../../../types-global/mcp.js';

const TOOL_NAME = 'dv360_validate_targeting_config';
const TOOL_TITLE = 'Validate DV360 Targeting Configuration';

const TOOL_DESCRIPTION = `Validate targeting configuration across multiple DV360 entities.

This workflow tool fetches and validates targeting settings for:
- Channel exclusions at IO level
- Geographic targeting at IO/Line Item level
- Placement settings at Ad Group level
- Keyword exclusions at Ad Group level

**Use cases:**
- Audit targeting before campaign launch
- Verify brand safety settings
- Check geographic reach

Provide entity IDs to check. The tool will fetch targeting for each and report any issues.`;

/**
 * Default targeting types to check when none specified
 */
const DEFAULT_TARGETING_TYPES: TargetingType[] = [
  'TARGETING_TYPE_CHANNEL',
  'TARGETING_TYPE_GEO_REGION',
  'TARGETING_TYPE_KEYWORD',
  'TARGETING_TYPE_URL',
  'TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION',
  'TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION',
];

/**
 * Dynamic shape for entity ID arrays (e.g., insertionOrderIds, lineItemIds, adGroupIds)
 * Generated from TARGETING_PARENT_TYPES config
 */
const ValidateEntityIdsShape = getValidateInputShape();

/**
 * Input schema for validate targeting config tool
 */
export const ValidateTargetingConfigInputSchema = z
  .object({
    advertiserId: z.string().describe('DV360 Advertiser ID'),
    ...ValidateEntityIdsShape,
    targetingTypesToCheck: z
      .array(z.enum(ALL_TARGETING_TYPES as unknown as [string, ...string[]]))
      .optional()
      .describe(
        'Specific targeting types to check. Defaults to common types: CHANNEL, GEO_REGION, KEYWORD, URL, DIGITAL_CONTENT_LABEL_EXCLUSION, SENSITIVE_CATEGORY_EXCLUSION'
      ),
  })
  .refine(hasAnyEntityIds, getEntityIdsValidationError)
  .describe('Parameters for validating targeting configuration');

/**
 * Output schema for validate targeting config tool
 */
export const ValidateTargetingConfigOutputSchema = z
  .object({
    valid: z.boolean().describe('Overall validation status (no errors found)'),
    issues: z
      .array(
        z.object({
          entityType: z.string(),
          entityId: z.string(),
          targetingType: z.string(),
          issue: z.string(),
          severity: z.enum(['error', 'warning', 'info']),
        })
      )
      .describe('List of issues found'),
    summary: z.object({
      totalEntitiesChecked: z.number(),
      totalTargetingOptionsFound: z.number(),
      issueCount: z.number(),
      errorCount: z.number(),
      warningCount: z.number(),
      infoCount: z.number(),
    }),
    timestamp: z.string().datetime(),
  })
  .describe('Validation result');

type ValidateTargetingConfigInput = z.infer<typeof ValidateTargetingConfigInputSchema>;
type ValidateTargetingConfigOutput = z.infer<typeof ValidateTargetingConfigOutputSchema>;

/**
 * Validate targeting config tool logic
 */
export async function validateTargetingConfigLogic(
  input: ValidateTargetingConfigInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ValidateTargetingConfigOutput> {
  const { targetingService } = resolveSessionServices(sdkContext);

  const targetingTypes = (input.targetingTypesToCheck as TargetingType[]) || DEFAULT_TARGETING_TYPES;

  // Build entityIds dynamically from input based on supported parent types
  const entityIds: Record<string, string[]> = {};
  for (const parentType of getSupportedTargetingParentTypes()) {
    const fieldName = getValidateIdsFieldName(parentType);
    const ids = (input as Record<string, unknown>)[fieldName] as string[] | undefined;
    if (ids && ids.length > 0) {
      entityIds[parentType] = ids;
    }
  }

  const result = await targetingService.validateTargetingConfig(
    input.advertiserId,
    entityIds,
    targetingTypes,
    context
  );

  const errorCount = result.issues.filter((i) => i.severity === 'error').length;
  const warningCount = result.issues.filter((i) => i.severity === 'warning').length;
  const infoCount = result.issues.filter((i) => i.severity === 'info').length;

  return {
    valid: result.valid,
    issues: result.issues,
    summary: {
      ...result.summary,
      errorCount,
      warningCount,
      infoCount,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format response for MCP client
 */
export function validateTargetingConfigResponseFormatter(result: ValidateTargetingConfigOutput): McpTextContent[] {
  const statusEmoji = result.valid ? 'PASS' : 'FAIL';
  const statusText = result.valid ? 'PASSED' : 'ISSUES FOUND';

  let issuesText = '';
  if (result.issues.length > 0) {
    const errorIssues = result.issues.filter((i) => i.severity === 'error');
    const warningIssues = result.issues.filter((i) => i.severity === 'warning');
    const infoIssues = result.issues.filter((i) => i.severity === 'info');

    if (errorIssues.length > 0) {
      issuesText += '\n\n**Errors:**\n';
      errorIssues.forEach((issue) => {
        issuesText += `- [${issue.entityType}:${issue.entityId}] ${issue.targetingType}: ${issue.issue}\n`;
      });
    }

    if (warningIssues.length > 0) {
      issuesText += '\n\n**Warnings:**\n';
      warningIssues.forEach((issue) => {
        issuesText += `- [${issue.entityType}:${issue.entityId}] ${issue.targetingType}: ${issue.issue}\n`;
      });
    }

    if (infoIssues.length > 0) {
      issuesText += '\n\n**Info:**\n';
      infoIssues.forEach((issue) => {
        issuesText += `- [${issue.entityType}:${issue.entityId}] ${issue.targetingType}: ${issue.issue}\n`;
      });
    }
  } else {
    issuesText = '\n\nNo issues found. Targeting configuration looks good!';
  }

  return [
    {
      type: 'text' as const,
      text: `${statusEmoji} Targeting Validation: ${statusText}

**Summary:**
- Entities checked: ${result.summary.totalEntitiesChecked}
- Targeting options found: ${result.summary.totalTargetingOptionsFound}
- Issues: ${result.summary.issueCount} (${result.summary.errorCount} errors, ${result.summary.warningCount} warnings, ${result.summary.infoCount} info)
${issuesText}

Timestamp: ${result.timestamp}`,
    },
  ];
}

/**
 * Validate Targeting Config Tool Definition
 */
export const validateTargetingConfigTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateTargetingConfigInputSchema,
  outputSchema: ValidateTargetingConfigOutputSchema,
  inputExamples: [
    {
      label: "Validate targeting for multiple line items",
      input: {
        advertiserId: "1234567",
        lineItemIds: ["5678901", "5678902"],
        targetingTypesToCheck: [
          "TARGETING_TYPE_GEO_REGION",
          "TARGETING_TYPE_CHANNEL",
          "TARGETING_TYPE_DIGITAL_CONTENT_LABEL_EXCLUSION",
        ],
      },
    },
    {
      label: "Audit full targeting config across IO and line items",
      input: {
        advertiserId: "1234567",
        insertionOrderIds: ["4445551"],
        lineItemIds: ["5678901", "5678902", "5678903"],
      },
    },
    {
      label: "Check keyword and brand-safety targeting on an ad group",
      input: {
        advertiserId: "1234567",
        adGroupIds: ["3334441"],
        targetingTypesToCheck: [
          "TARGETING_TYPE_KEYWORD",
          "TARGETING_TYPE_SENSITIVE_CATEGORY_EXCLUSION",
        ],
      },
    },
  ],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: validateTargetingConfigLogic,
  responseFormatter: validateTargetingConfigResponseFormatter,
};
