// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Resource Handler Factory
 *
 * Extracts common MCP resource registration boilerplate into reusable handlers.
 * - registerStaticResourcesFromDefinitions: fixed-URI resources.
 * - registerTemplatedResourcesFromDefinitions: parameterized URI templates
 *   (e.g. `entity-schema://{type}`). The consumer owns the MCP SDK dependency
 *   and supplies a `templateBuilder` (typically `(t, o) => new ResourceTemplate(t, o)`).
 */

import type { Logger } from "pino";

/**
 * Static resource definition — resources with a fixed URI and content.
 */
export interface StaticResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  getContent: (uri?: URL) => string | Promise<string>;
}

/**
 * Structural type for McpServer resource registration (static resources only).
 */
interface McpServerResourceLike {
  registerResource(
    id: string,
    uri: string,
    metadata: { description: string; mimeType: string },
    handler: (uri: URL) => Promise<{
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    }>
  ): void;
}

export interface RegisterStaticResourcesOptions {
  server: McpServerResourceLike;
  resources: StaticResourceDefinition[];
  logger: Logger;
}

/**
 * Register all static resources on an McpServer with standardized handling.
 */
export function registerStaticResourcesFromDefinitions(opts: RegisterStaticResourcesOptions): void {
  const { server, resources, logger } = opts;

  for (const resource of resources) {
    const resourceId = resource.uri.replace(/[^a-zA-Z0-9]/g, "_");

    server.registerResource(
      resourceId,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async (uri: URL) => {
        logger.info({ resourceUri: resource.uri }, "Handling resource read");

        try {
          const content = await resource.getContent(uri);
          logger.debug(
            {
              resourceUri: resource.uri,
              contentBytes: Buffer.byteLength(content, "utf-8"),
            },
            "Resource content size"
          );
          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType,
                text: content,
              },
            ],
          };
        } catch (error) {
          logger.error({ error, resourceUri: resource.uri }, "Failed to read resource");
          throw error;
        }
      }
    );
  }

  logger.info({ resourceCount: resources.length }, "Registered MCP resources");
}

// ---------------------------------------------------------------------------
// Templated (parameterized URI) resources
// ---------------------------------------------------------------------------

/**
 * Listed resource entry (used by an optional `list` callback to enumerate
 * concrete instances of a templated URI).
 */
export interface TemplatedResourceListing {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * Templated resource definition — URI template like `entity-schema://{type}`
 * plus a content resolver that receives the parsed variables.
 */
export interface TemplatedResourceDefinition {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
  resolveContent: (
    uri: URL,
    variables: Record<string, string | string[]>
  ) => string | Promise<string>;
  list?: () => Promise<TemplatedResourceListing[]>;
}

/**
 * Structural type for the SDK's `registerResource` overload that accepts a
 * `ResourceTemplate`. Shared avoids importing `@modelcontextprotocol/sdk`
 * directly — the consumer supplies a `templateBuilder` callback.
 */
interface McpServerTemplatedResourceLike {
  registerResource(
    id: string,
    template: unknown,
    metadata: { description: string; mimeType: string; title?: string },
    handler: (
      uri: URL,
      variables: Record<string, string | string[]>
    ) => Promise<{
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    }>
  ): void;
}

export interface TemplateBuilderOptions {
  /**
   * Always present (matches the SDK's `ResourceTemplate` constructor) but may
   * be undefined when the resource definition does not opt in to enumeration.
   */
  list:
    | (() => Promise<{
        resources: Array<{
          uri: string;
          name: string;
          description?: string;
          mimeType?: string;
        }>;
      }>)
    | undefined;
}

export type TemplateBuilder = (uriTemplate: string, options: TemplateBuilderOptions) => unknown;

export interface RegisterTemplatedResourcesOptions {
  server: McpServerTemplatedResourceLike;
  templateBuilder: TemplateBuilder;
  resources: TemplatedResourceDefinition[];
  logger: Logger;
}

/**
 * Register templated (URI-template) resources on an McpServer.
 *
 * @example
 * ```ts
 * import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
 * registerTemplatedResourcesFromDefinitions({
 *   server,
 *   templateBuilder: (t, o) => new ResourceTemplate(t, o),
 *   resources: [{
 *     uriTemplate: "ttd-field-rules://{entityType}",
 *     name: "TTD Field Rules",
 *     description: "Per-entity required fields and enum suggestions",
 *     mimeType: "application/json",
 *     resolveContent: (_uri, vars) => JSON.stringify(getRules(vars.entityType as string)),
 *     list: async () => entityTypes.map((t) => ({
 *       uri: `ttd-field-rules://${t}`, name: `TTD field rules for ${t}`,
 *     })),
 *   }],
 *   logger,
 * });
 * ```
 */
export function registerTemplatedResourcesFromDefinitions(
  opts: RegisterTemplatedResourcesOptions
): void {
  const { server, templateBuilder, resources, logger } = opts;

  for (const resource of resources) {
    const resourceId = resource.uriTemplate.replace(/[^a-zA-Z0-9]/g, "_");

    const templateOptions: TemplateBuilderOptions = {
      list: resource.list
        ? async () => {
            const items = await resource.list!();
            return {
              resources: items.map((item) => ({
                uri: item.uri,
                name: item.name,
                description: item.description,
                mimeType: item.mimeType ?? resource.mimeType,
              })),
            };
          }
        : undefined,
    };

    const template = templateBuilder(resource.uriTemplate, templateOptions);

    server.registerResource(
      resourceId,
      template,
      {
        description: resource.description,
        mimeType: resource.mimeType,
        title: resource.name,
      },
      async (uri, variables) => {
        logger.info(
          { resourceUri: uri.href, template: resource.uriTemplate, variables },
          "Handling templated resource read"
        );

        try {
          const content = await resource.resolveContent(uri, variables);
          logger.debug(
            {
              resourceUri: uri.href,
              contentBytes: Buffer.byteLength(content, "utf-8"),
            },
            "Resource content size"
          );
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: resource.mimeType,
                text: content,
              },
            ],
          };
        } catch (error) {
          logger.error(
            { error, resourceUri: uri.href, template: resource.uriTemplate },
            "Failed to read templated resource"
          );
          throw error;
        }
      }
    );
  }

  logger.info(
    { resourceCount: resources.length },
    "Registered templated MCP resources"
  );
}
