import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "cm360_list_user_profiles";
const TOOL_TITLE = "List CM360 User Profiles";
const TOOL_DESCRIPTION = `List all CM360 user profiles accessible with the current credentials.

This is the bootstrap call — profileId is required for all other CM360 operations. Call this first to discover available profiles.`;

export const ListUserProfilesInputSchema = z
  .object({})
  .describe("No parameters required");

export const ListUserProfilesOutputSchema = z
  .object({
    profiles: z.array(z.record(z.any())).describe("List of user profiles"),
    totalCount: z.number().describe("Number of profiles returned"),
    timestamp: z.string().datetime(),
  })
  .describe("User profiles result");

type ListUserProfilesOutput = z.infer<typeof ListUserProfilesOutputSchema>;

export async function listUserProfilesLogic(
  _input: Record<string, never>,
  _context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListUserProfilesOutput> {
  const { cm360Service } = resolveSessionServices(sdkContext);

  const result = (await cm360Service.listUserProfiles(_context)) as Record<string, unknown>;
  const profiles = (result.items as unknown[]) || [];

  return {
    profiles: profiles as Record<string, any>[],
    totalCount: profiles.length,
    timestamp: new Date().toISOString(),
  };
}

export function listUserProfilesResponseFormatter(result: ListUserProfilesOutput): unknown[] {
  const profiles =
    result.totalCount > 0
      ? `\n\nProfiles:\n${JSON.stringify(result.profiles, null, 2)}`
      : "\n\nNo profiles found";

  return [
    {
      type: "text" as const,
      text: `Found ${result.totalCount} user profiles${profiles}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listUserProfilesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListUserProfilesInputSchema,
  outputSchema: ListUserProfilesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all accessible profiles",
      input: {},
    },
  ],
  logic: listUserProfilesLogic,
  responseFormatter: listUserProfilesResponseFormatter,
};
