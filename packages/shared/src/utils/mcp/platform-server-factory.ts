// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared factory for a platform server's `createMcpServer`.
 *
 * Thirteen servers carried the same ~150-line `server.ts` template: build the
 * server info, create the interaction logger, register tools, resources, the
 * `report-csv://` template, the conformance fixtures and prompts. What differs
 * per platform is data (name, description, instructions, the tool / resource /
 * prompt lists, the workflow-id map) plus two optional pieces of wiring. This
 * factory owns the template; a server's `server.ts` keeps only that data.
 *
 * Registration order is part of the wire contract (`tools/list`,
 * `resources/list`, `resources/templates/list` and `prompts/list` list in
 * registration order), so it is fixed here: tools, static resources, templated
 * resources, `report-csv://`, conformance fixtures, prompts.
 *
 * The shared package takes no dependency on `@modelcontextprotocol/server`, so the
 * caller passes the two SDK classes it needs (`McpServer`, `ResourceTemplate`).
 */

import type { Logger } from "pino";
import type { SessionAuthContext } from "../../auth/auth-strategy.js";
import { createManifestEntryResolver } from "../../governance/manifest-resolver.js";
import { isConformanceFixturesEnabled } from "../conformance/conformance-env.js";
import { InteractionLogger } from "../observability/interaction-logger.js";
import { createOperationContext } from "../observability/request-context.js";
import { registerReportCsvResource } from "../reporting/report-csv-resource.js";
import type {
  RegisterReportCsvResourceOptions,
  ResourceTemplateLike,
} from "../reporting/report-csv-resource.js";
import type { ReportCsvStore } from "../reporting/report-csv-store.js";
import { buildServerInfo, type ServerInfo } from "../transport/server-card-builder.js";
import {
  registerPromptsFromDefinitions,
  type McpServerPromptLike,
  type PromptArgumentForFactory,
  type PromptDefinitionForFactory,
} from "./prompt-handler-factory.js";
import {
  registerStaticResourcesFromDefinitions,
  registerTemplatedResourcesFromDefinitions,
  type RegisterStaticResourcesOptions,
  type RegisterTemplatedResourcesOptions,
  type StaticResourceDefinition,
  type TemplateBuilderOptions,
  type TemplatedResourceDefinition,
} from "./resource-handler-factory.js";
import { registerToolsFromDefinitions } from "./tool-handler-factory.js";
import type { RegisterToolsOptions, ToolDefinitionForFactory } from "./tool-handler-factory.js";
import { extractZodShape } from "./zod-helpers.js";

/**
 * What a platform's `McpServer` must offer: everything the registration helpers
 * call on it. The SDK's `McpServer` satisfies all four structural types.
 */
export type PlatformMcpServerLike = RegisterToolsOptions["server"] &
  RegisterStaticResourcesOptions["server"] &
  RegisterTemplatedResourcesOptions["server"] &
  RegisterReportCsvResourceOptions["server"];

/**
 * The SDK classes the factory instantiates. `options` is the SDK's own
 * `ServerOptions`, which this package cannot name without importing the SDK.
 */
export interface PlatformMcpSdk<TServer extends PlatformMcpServerLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  McpServer: new (serverInfo: ServerInfo, options: any) => TServer;
  ResourceTemplate: ResourceTemplateLike &
    (new (uriTemplate: string, options: TemplateBuilderOptions) => unknown);
}

/** An entry of a server's `promptRegistry`: the SDK `Prompt` plus its generator. */
export interface PlatformPromptEntry {
  prompt: {
    name: string;
    description?: string;
    arguments?: PromptArgumentForFactory[];
  };
  generateMessage: (args?: Record<string, string>) => string;
}

export interface PlatformMcpServerOptions<TServer extends PlatformMcpServerLike> {
  sdk: PlatformMcpSdk<TServer>;
  logger: Logger;
  sessionId?: string;
  gcsBucket?: string;

  /** npm package / service name, e.g. `"tiktok-mcp"`. Names the server and its interaction log. */
  packageName: string;
  /**
   * Platform key passed to `registerToolsFromDefinitions`. It labels tool spans
   * and metrics, so changing a server's value is an observable change.
   */
  platform: string;
  version: string;
  description: string;
  instructions: string;
  /** Capabilities beyond the `logging` capability every server advertises. */
  extraCapabilities?: Record<string, unknown>;

  tools: ToolDefinitionForFactory[];
  /** Fixed-URI resources. */
  resources: StaticResourceDefinition[];
  /** URI-template resources, registered after the static ones. */
  templatedResources?: TemplatedResourceDefinition[];
  /** The server's prompt registry (`promptRegistry.values()`). */
  prompts: Iterable<PlatformPromptEntry>;
  /**
   * Interaction-log workflow id per tool. Every tool registered through the
   * factory except the generated `*_search_tools` must appear here, and nothing
   * else may (`scripts/lib/workflow-id-maps.test.mjs`).
   */
  workflowIdByToolName: Record<string, string>;
  /**
   * Where the attested `cesteral-manifest.json` sits, relative to the server's
   * `server.ts`. Every governed server passes it, so the decision-token check can
   * bind a token to each tool's attested `definitionHash`. A server with no
   * governed tools (dbm-mcp) ships no manifest and leaves it out.
   */
  manifestUrl?: URL;

  /** The server's session store. */
  sessionServiceStore: {
    getAuthContext(sessionId: string): SessionAuthContext | undefined;
    delete(sessionId: string): unknown;
  };
  /**
   * Drop the session when a tool call fails Unauthorized, so the client's next
   * request re-authenticates at the transport and gets a clean HTTP 401 +
   * `authErrorHint` instead of retrying into the same in-band error. For servers
   * whose credentials can die mid-session (an expired or revoked refresh token).
   */
  dropSessionOnAuthError?: boolean;

  /**
   * Register the `report-csv://{id}` template. Only servers whose
   * `*_download_report` tool offers `storeRawCsv` set this.
   */
  reportCsv?: {
    store: ReportCsvStore;
    /** Label in the listing name and description, e.g. `"TikTok"`. */
    platformLabel: string;
    downloadToolName: string;
  };
}

/**
 * #248 (MCP 2026-07-28 cache hints). The tool, prompt and template catalogs and
 * the schema / fields / examples resources are fixed per release and identical
 * for every principal, so they are advertised as long-lived and shareable.
 * Anything that holds tenant data is not: `resources/read` keeps the SDK's
 * `0` / `private` default unless a resource opts in, and `resources/list` is
 * only public when the server has no `report-csv://` entries in it.
 */
export const STATIC_CATALOG_CACHE_HINT = { ttlMs: 60 * 60 * 1000, cacheScope: "public" } as const;

export function buildListCacheHints(hasReportCsv: boolean) {
  return {
    "tools/list": STATIC_CATALOG_CACHE_HINT,
    "prompts/list": STATIC_CATALOG_CACHE_HINT,
    "resources/templates/list": STATIC_CATALOG_CACHE_HINT,
    ...(hasReportCsv ? {} : { "resources/list": STATIC_CATALOG_CACHE_HINT }),
  };
}

/**
 * Create and configure a platform's MCP server.
 */
export async function createPlatformMcpServer<TServer extends PlatformMcpServerLike>(
  opts: PlatformMcpServerOptions<TServer>
): Promise<TServer> {
  const { sdk, logger, sessionId, packageName, sessionServiceStore, reportCsv } = opts;

  const server = new sdk.McpServer(
    buildServerInfo(packageName, { version: opts.version, description: opts.description }),
    {
      capabilities: { logging: {}, ...opts.extraCapabilities },
      instructions: opts.instructions,
      cacheHints: buildListCacheHints(Boolean(reportCsv)),
    }
  );

  const interactionLogger = InteractionLogger.shared({
    serverName: packageName,
    logger,
    gcsBucket: opts.gcsBucket,
  });

  registerToolsFromDefinitions({
    server,
    tools: opts.tools,
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
    resolveManifestEntry: opts.manifestUrl
      ? createManifestEntryResolver(opts.manifestUrl)
      : undefined,
    createRequestContext: (params) =>
      createOperationContext({
        operation: params.operation,
        additionalContext: params.additionalContext,
      }),
    defaultTextFormat: "compact",
    packageName,
    platform: opts.platform,
    workflowIdByToolName: opts.workflowIdByToolName,
    interactionLogger,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
    onAuthError: opts.dropSessionOnAuthError
      ? (staleSessionId) => {
          logger.warn(
            { sessionId: staleSessionId },
            "Dropping session after Unauthorized tool failure — credentials are no longer valid"
          );
          sessionServiceStore.delete(staleSessionId);
        }
      : undefined,
  });

  registerStaticResourcesFromDefinitions({
    server,
    resources: opts.resources,
    logger,
    cacheHint: STATIC_CATALOG_CACHE_HINT,
  });

  if (opts.templatedResources) {
    registerTemplatedResourcesFromDefinitions({
      server,
      templateBuilder: (uriTemplate, options) => new sdk.ResourceTemplate(uriTemplate, options),
      resources: opts.templatedResources,
      logger,
      cacheHint: STATIC_CATALOG_CACHE_HINT,
    });
  }

  if (reportCsv) {
    registerReportCsvResource({
      server,
      ResourceTemplate: sdk.ResourceTemplate,
      store: reportCsv.store,
      platform: reportCsv.platformLabel,
      downloadToolName: reportCsv.downloadToolName,
      logger,
    });
  }

  if (isConformanceFixturesEnabled()) {
    const { conformanceResources, conformanceResourceTemplate, conformancePrompts } = await import(
      "../conformance/conformance-fixtures.js"
    );

    registerStaticResourcesFromDefinitions({ server, resources: conformanceResources, logger });

    server.registerResource(
      "conformance_template",
      new sdk.ResourceTemplate(conformanceResourceTemplate.uriTemplate, { list: undefined }),
      {
        description: conformanceResourceTemplate.description,
        mimeType: conformanceResourceTemplate.mimeType,
      },
      async (uri, variables) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: conformanceResourceTemplate.mimeType,
            text: conformanceResourceTemplate.getContent((variables.id as string) || "unknown"),
          },
        ],
      })
    );

    registerPromptsFromDefinitions({
      server: server as unknown as McpServerPromptLike,
      prompts: conformancePrompts,
      logger,
    });
  }

  const prompts: PromptDefinitionForFactory[] = Array.from(opts.prompts, (def) => ({
    name: def.prompt.name,
    description: def.prompt.description ?? "",
    arguments: def.prompt.arguments,
    generateMessage: def.generateMessage,
  }));
  registerPromptsFromDefinitions({
    server: server as unknown as McpServerPromptLike,
    prompts,
    logger,
  });

  return server;
}
