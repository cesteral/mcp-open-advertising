/**
 * Static Resource Handler Factory
 *
 * Extracts common MCP resource registration boilerplate into a reusable handler.
 * Handles static (non-parameterized) resources. DV360's parameterized resources
 * (ResourceTemplate + URI templates) are handled separately in dv360-mcp.
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
  getContent: () => string;
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
      async () => {
        logger.info({ resourceUri: resource.uri }, "Handling resource read");

        try {
          const content = resource.getContent();
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
