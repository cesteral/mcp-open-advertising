// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

/**
 * Prototype (SEP-2640, Skills over MCP): a server built by
 * `createPlatformMcpServer({ skills })` serves `skills/list`, `skills/get` and
 * `resources/read` for `skill://` URIs, declares `io.modelcontextprotocol/skills`
 * in `server/discover`, and leaves every other list where it was.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import pino from "pino";
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
  PROTOCOL_VERSION_META_KEY,
  CLIENT_INFO_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import { SKILLS_EXTENSION_ID, SKILL_LIMITS } from "@modelcontextprotocol/server/ext/skills";
import {
  createPlatformMcpServer,
  type PlatformSkillsSource,
} from "../../src/utils/mcp/platform-server-factory.js";
import {
  CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_DESCRIPTION,
  CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME,
  CROSS_PLATFORM_SKILL_FILES,
  SKILL_DESCRIPTION_MAX_LENGTH,
  renderCrossPlatformCampaignSetupSkill,
} from "../../src/utils/mcp/cross-platform-skills.js";
import { getCrossPlatformCampaignSetupMessage } from "../../src/utils/mcp/cross-platform-prompts.js";

const logger = pino({ level: "silent" });
const PROTOCOL = "2026-07-28";
const SKILL_URI = `skill://${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}/SKILL.md`;

type JsonRpcBody = { result?: Record<string, unknown>; error?: { code: number } };

/** A modern-era (2026-07-28) request through the SDK's own stateless handler. */
function modernCaller(build: () => Promise<McpServer>) {
  const handler = createMcpHandler(() => build());
  return async (method: string, params: Record<string, unknown> = {}): Promise<JsonRpcBody> => {
    const res = await handler.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-method": method,
          "mcp-protocol-version": PROTOCOL,
          ...(typeof params.uri === "string" && { "mcp-name": params.uri }),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: PROTOCOL,
              [CLIENT_INFO_META_KEY]: { name: "c", version: "0.0.0" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        }),
      })
    );
    return (await res.json()) as JsonRpcBody;
  };
}

async function result(
  call: ReturnType<typeof modernCaller>,
  method: string,
  params?: Record<string, unknown>
) {
  const body = await call(method, params);
  if (!body.result) throw new Error(`${method}: ${JSON.stringify(body)}`);
  return body.result;
}

function platformServer(skills?: PlatformSkillsSource) {
  return () =>
    createPlatformMcpServer({
      sdk: { McpServer: McpServer as never, ResourceTemplate: ResourceTemplate as never },
      logger,
      packageName: "meta-mcp",
      platform: "probe",
      version: "0.0.0",
      description: "probe",
      instructions: "probe",
      tools: [],
      extraCapabilities: { tools: {} },
      resources: [
        {
          uri: "entity-schema://probe",
          name: "Probe schema",
          description: "static",
          mimeType: "application/json",
          getContent: () => "{}",
        },
      ],
      templatedResources: [
        {
          uriTemplate: "entity-examples://{type}",
          name: "Probe examples",
          description: "static",
          mimeType: "application/json",
          resolveContent: () => "{}",
        },
      ],
      prompts: [{ prompt: { name: "p", description: "p" }, generateMessage: () => "p" }],
      workflowIdByToolName: {},
      sessionServiceStore: { getAuthContext: () => undefined, delete: () => undefined },
      ...(skills && { skills }),
    } as never) as Promise<McpServer>;
}

const sha256 = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

describe("cross-platform-campaign-setup skill source", () => {
  const skillMd = renderCrossPlatformCampaignSetupSkill();

  it("is the prompt's own text, so the two cannot drift", () => {
    const body = getCrossPlatformCampaignSetupMessage({
      totalBudget: "{totalBudget}",
      currency: "{currency}",
      objective: "{objective}",
    });
    expect(skillMd.endsWith(body)).toBe(true);
    expect(CROSS_PLATFORM_SKILL_FILES[`${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}/SKILL.md`]).toBe(
      skillMd
    );
  });

  it("has Agent Skills frontmatter: name = folder, description within the limit", () => {
    expect(skillMd.startsWith(`---\nname: ${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}\n`)).toBe(
      true
    );
    expect(CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_DESCRIPTION.length).toBeLessThanOrEqual(
      SKILL_DESCRIPTION_MAX_LENGTH
    );
    expect(Buffer.byteLength(skillMd)).toBeLessThan(SKILL_LIMITS.bytes);
  });
});

describe("Skills over MCP on createPlatformMcpServer (SEP-2640)", () => {
  const skillMd = renderCrossPlatformCampaignSetupSkill();

  it("serves skills/list, skills/get and resources/read with the static cache hint", async () => {
    const call = modernCaller(platformServer({ files: CROSS_PLATFORM_SKILL_FILES }));

    const listed = await result(call, "skills/list");
    expect(listed).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    const skills = listed.skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual({
      uri: SKILL_URI,
      frontmatter: {
        name: CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME,
        description: CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_DESCRIPTION,
      },
      resources: [{ uri: SKILL_URI, digest: sha256(skillMd), size: Buffer.byteLength(skillMd) }],
    });

    const got = await result(call, "skills/get", { uri: SKILL_URI });
    expect(got.skill).toEqual(skills[0]);
    expect(got).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });

    const read = await result(call, "resources/read", { uri: SKILL_URI });
    expect(read).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    expect(read.contents).toEqual([{ uri: SKILL_URI, mimeType: "text/markdown", text: skillMd }]);
  });

  it("answers an unknown skill with -32602", async () => {
    const call = modernCaller(platformServer({ files: CROSS_PLATFORM_SKILL_FILES }));
    const body = await call("skills/get", { uri: "skill://no-such-skill/SKILL.md" });
    expect(body.error?.code).toBe(-32602);
  });

  it("declares the extension in server/discover only when skills are on", async () => {
    const on = await result(
      modernCaller(platformServer({ files: CROSS_PLATFORM_SKILL_FILES })),
      "server/discover"
    );
    expect((on.capabilities as Record<string, Record<string, unknown>>).extensions).toEqual({
      // A SkillCatalog implements resources/directory/read, so it declares it.
      [SKILLS_EXTENSION_ID]: { directoryRead: true },
    });
    expect((on.capabilities as Record<string, unknown>).resources).toBeDefined();

    const off = await result(modernCaller(platformServer()), "server/discover");
    expect((off.capabilities as Record<string, unknown>).extensions).toBeUndefined();
    const body = await modernCaller(platformServer())("skills/list");
    expect(body.error?.code).toBe(-32601);
  });

  it("keeps every other list in place and appends the skill entries last", async () => {
    const on = modernCaller(platformServer({ files: CROSS_PLATFORM_SKILL_FILES }));
    const off = modernCaller(platformServer());
    for (const method of ["tools/list", "prompts/list"]) {
      expect(await result(on, method), method).toEqual(await result(off, method));
    }

    // The catalog lists each SKILL.md in resources/list, after everything else.
    const listOn = await result(on, "resources/list");
    const listOff = await result(off, "resources/list");
    expect(listOn).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    const resourcesOn = listOn.resources as Array<Record<string, unknown>>;
    expect(resourcesOn.slice(0, -1)).toEqual(listOff.resources);
    expect(resourcesOn.at(-1)).toMatchObject({
      uri: SKILL_URI,
      name: CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME,
      mimeType: "text/markdown",
    });

    const templatesOn = (await result(on, "resources/templates/list")).resourceTemplates as Array<{
      uriTemplate: string;
    }>;
    const templatesOff = (await result(off, "resources/templates/list"))
      .resourceTemplates as Array<{ uriTemplate: string }>;
    expect(templatesOn.slice(0, -1)).toEqual(templatesOff);
    expect(templatesOn.at(-1)?.uriTemplate).toBe("skill://{+path}");
  });

  it("loads the same skill from a folder on disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "cesteral-skills-"));
    mkdirSync(join(root, CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME));
    writeFileSync(join(root, CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME, "SKILL.md"), skillMd);

    const call = modernCaller(platformServer({ folder: root }));
    const read = await result(call, "resources/read", { uri: SKILL_URI });
    expect((read.contents as Array<{ text: string }>)[0]?.text).toBe(skillMd);
  });

  it("lists a skill's folder through resources/directory/read", async () => {
    const call = modernCaller(platformServer({ files: CROSS_PLATFORM_SKILL_FILES }));
    const dir = await result(call, "resources/directory/read", {
      uri: `skill://${CROSS_PLATFORM_CAMPAIGN_SETUP_SKILL_NAME}`,
    });
    expect((dir.resources as Array<{ uri: string }>).map((r) => r.uri)).toEqual([SKILL_URI]);
  });
});
