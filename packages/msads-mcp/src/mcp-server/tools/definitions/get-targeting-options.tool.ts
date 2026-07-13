// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_get_targeting_options";
const TOOL_TITLE = "Get Microsoft Ads Targeting Options (Static Reference)";
const TOOL_DESCRIPTION = `Discover the valid criterion targeting values to pass to \`msads_manage_criterions\`. This is the read-side counterpart to the criterion writes.

This tool does NOT call the Microsoft Advertising API — the values are fixed enums in the Campaign Management API schema (not a queryable endpoint), so they are served locally.

Supported targeting types:
- age: AgeRange criterion values
- gender: Gender criterion values
- device: DeviceType criterion values
- day: DayTime criterion day-of-week values (combine with FromHour/ToHour for dayparting)

Location targets are NOT enumerable via the REST API — use the Campaign Management \`GetGeoLocationsFileUrl\` operation to download the full geo-location reference file. Radius/proximity targets take caller-supplied coordinates, so they have no fixed enum to list.`;

export const GetTargetingOptionsInputSchema = z
  .object({
    targetingType: z
      .enum(["age", "gender", "device", "day"])
      .optional()
      .describe("Criterion targeting type to enumerate; omit to return all types"),
  })
  .describe("Parameters for listing Microsoft Ads criterion targeting options");

export const GetTargetingOptionsOutputSchema = z
  .object({
    options: z
      .record(z.array(z.record(z.any())))
      .describe("Targeting option values keyed by targeting type"),
    timestamp: z.string().datetime(),
  })
  .describe("Targeting options reference");

type GetTargetingOptionsInput = z.infer<typeof GetTargetingOptionsInputSchema>;
type GetTargetingOptionsOutput = z.infer<typeof GetTargetingOptionsOutputSchema>;

/**
 * Static Microsoft Advertising Campaign Management criterion enum values.
 * These are fixed in the API schema; MS Ads exposes no endpoint to query them.
 */
const TARGETING_OPTIONS: Record<string, Array<Record<string, unknown>>> = {
  age: [
    { Id: "EighteenToTwentyFour", Name: "18-24" },
    { Id: "TwentyFiveToThirtyFour", Name: "25-34" },
    { Id: "ThirtyFiveToFortyNine", Name: "35-49" },
    { Id: "FiftyToSixtyFour", Name: "50-64" },
    { Id: "SixtyFiveAndAbove", Name: "65+" },
  ],
  gender: [
    { Id: "Male", Name: "Male" },
    { Id: "Female", Name: "Female" },
  ],
  device: [
    { Id: "Computers", Name: "Computers" },
    { Id: "Smartphones", Name: "Smartphones" },
    { Id: "Tablets", Name: "Tablets" },
  ],
  day: [
    { Id: "Monday", Name: "Monday" },
    { Id: "Tuesday", Name: "Tuesday" },
    { Id: "Wednesday", Name: "Wednesday" },
    { Id: "Thursday", Name: "Thursday" },
    { Id: "Friday", Name: "Friday" },
    { Id: "Saturday", Name: "Saturday" },
    { Id: "Sunday", Name: "Sunday" },
  ],
};

export async function getTargetingOptionsLogic(
  input: GetTargetingOptionsInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<GetTargetingOptionsOutput> {
  const options: Record<string, Array<Record<string, unknown>>> = input.targetingType
    ? { [input.targetingType]: TARGETING_OPTIONS[input.targetingType] ?? [] }
    : TARGETING_OPTIONS;

  return {
    options,
    timestamp: new Date().toISOString(),
  };
}

export function getTargetingOptionsResponseFormatter(
  result: GetTargetingOptionsOutput
): McpTextContent[] {
  const lines = Object.entries(result.options)
    .map(([type, values]) => `${type} (${values.length}): ${values.map((v) => v.Id).join(", ")}`)
    .join("\n");
  return [
    {
      type: "text" as const,
      text: `Microsoft Ads criterion targeting options (static reference)\n\n${lines}\n\nFull detail:\n${JSON.stringify(result.options, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getTargetingOptionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetTargetingOptionsInputSchema,
  outputSchema: GetTargetingOptionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "List every criterion targeting type",
      input: {},
    },
    {
      label: "List the day-of-week values for dayparting",
      input: { targetingType: "day" },
    },
  ],
  logic: getTargetingOptionsLogic,
  responseFormatter: getTargetingOptionsResponseFormatter,
};
