// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { buildReportCsvUri, REPORT_CSV_RESOURCE_SCHEME } from "./report-csv-store.js";
import type { ReportCsvStore } from "./report-csv-store.js";

/**
 * Minimal shape we need from `@modelcontextprotocol/sdk`'s `McpServer`
 * — declared structurally so the shared package does not take a hard
 * dependency on the SDK.
 */
export interface McpServerResourceLike {
  registerResource(
    name: string,
    template: unknown,
    metadata: { description?: string; mimeType?: string },
    handler: (uri: { href: string }) => Promise<{
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    }>
  ): void;
}

/**
 * Minimal shape we need from `ResourceTemplate` — constructor + whatever
 * the SDK stores internally. Declared structurally to avoid an import of
 * the SDK from this package.
 */
export interface ResourceTemplateLike {
  new (
    uriTemplate: string,
    options: {
      list: () => Promise<{
        resources: Array<{
          uri: string;
          name: string;
          description: string;
          mimeType: string;
        }>;
      }>;
    }
  ): unknown;
}

/**
 * Options controlling the report-csv:// resource template that each
 * server registers.
 */
export interface RegisterReportCsvResourceOptions {
  /** The MCP server instance. */
  server: McpServerResourceLike;
  /** The SDK's `ResourceTemplate` class. Passed in by the caller so the
   * shared package does not need to import the SDK. */
  ResourceTemplate: ResourceTemplateLike;
  /** The report-csv store to read from / list entries in. */
  store: ReportCsvStore;
  /** Platform label used in the listing `name` and `description`
   * (e.g. "TTD", "Meta", "Snapchat"). */
  platform: string;
  /** The download tool name whose `storeRawCsv: true` flag populates the
   * store (e.g. "ttd_download_report"). Used in the template-level
   * description only. */
  downloadToolName: string;
  /** The server logger used for "reading resource" info lines. */
  logger: Logger;
}

/**
 * Register a `report-csv://{id}` resource template on the given MCP server
 * instance. Each server passes in its own `server`, `ResourceTemplate`
 * class, and per-process `ReportCsvStore`; everything else (listing format,
 * read handler, not-found error) is identical across platforms.
 */
export function registerReportCsvResource(opts: RegisterReportCsvResourceOptions): void {
  const { server, ResourceTemplate, store, platform, downloadToolName, logger } = opts;

  const template = new ResourceTemplate(`${REPORT_CSV_RESOURCE_SCHEME}://{id}`, {
    list: async () => ({
      resources: store.list().map((entry) => ({
        uri: buildReportCsvUri(entry.resourceId),
        name: `${platform} report CSV ${entry.resourceId}`,
        description:
          `Stored ${platform} report CSV (${entry.byteLength} bytes` +
          `${entry.truncated ? ", truncated" : ""}). ` +
          `Expires at ${new Date(entry.expiresAt).toISOString()}.`,
        mimeType: entry.mimeType,
      })),
    }),
  });

  server.registerResource(
    "report_csv_template",
    template,
    {
      description:
        `Raw report CSV bodies stored on demand by ${downloadToolName} (storeRawCsv: true). ` +
        `Entries expire after 30 minutes.`,
      mimeType: "text/csv",
    },
    async (uri) => {
      logger.info({ uri: uri.href }, "Reading report CSV resource");
      const entry = store.getByUri(uri.href);
      if (!entry) {
        throw new Error(`Report CSV resource not found or expired: ${uri.href}`);
      }
      return {
        contents: [{ uri: uri.href, mimeType: entry.mimeType, text: entry.csv }],
      };
    }
  );
}
