// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import { buildReportCsvUri, REPORT_CSV_RESOURCE_SCHEME } from "./report-csv-store.js";
import type { ReportCsvStore } from "./report-csv-store.js";
import { REPORT_CSV_UNTRUSTED_MARKER, untrustedResourceMeta } from "../mcp/untrusted-content.js";
import { JsonRpcErrorCode, McpError } from "../mcp-errors.js";

/**
 * Unknown, expired and other-session reads all answer the same -32602
 * (InvalidParams): the code the SDK itself uses for an unregistered resource,
 * and the one MCP 2026-07-28 assigns to "resource not found" (#248). A plain
 * Error surfaced as -32603, which tells a client the server broke rather than
 * that the URI is no good.
 */
/** Registration-time hint for `report-csv://`: private, uncached unless a read narrows it. */
export const REPORT_CSV_CACHE_HINT = { ttlMs: 0, cacheScope: "private" } as const;

function reportCsvNotFound(href: string): McpError {
  return new McpError(
    JsonRpcErrorCode.InvalidParams,
    `Report CSV resource not found or expired: ${href}`
  );
}

/**
 * Minimal shape we need from `@modelcontextprotocol/server`'s `McpServer`
 * — declared structurally so the shared package does not take a hard
 * dependency on the SDK.
 */
export interface McpServerResourceLike {
  registerResource(
    name: string,
    template: unknown,
    metadata: {
      description?: string;
      mimeType?: string;
      cacheHint?: { ttlMs?: number; cacheScope?: "public" | "private" };
    },
    handler: (
      uri: { href: string },
      variables: unknown,
      extra?: { sessionId?: string }
    ) => Promise<{
      /** 2026-07-28 cache fields; the SDK uses a handler's own over any registered hint. */
      ttlMs?: number;
      cacheScope?: "public" | "private";
      contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
        _meta?: Record<string, unknown>;
      }>;
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
      // The SDK invokes this with the request's `RequestHandlerExtra`, which
      // carries `sessionId` — the same value it passes to the read handler.
      // We take it so the listing can be scoped to the calling session.
      list: (extra?: { sessionId?: string }) => Promise<{
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
  /**
   * The store key this server instance was built for. On the 2025 path it is
   * the session id the transport also reports in `extra.sessionId`; on the
   * 2026-07-28 path there is no transport session, so this principal-derived
   * key is the only caller identity, and an entry another principal produced
   * stays "not found" (#243).
   */
  ownerKey?: string;
}

/**
 * Register a `report-csv://{id}` resource template on the given MCP server
 * instance. Each server passes in its own `server`, `ResourceTemplate`
 * class, and per-process `ReportCsvStore`; everything else (listing format,
 * read handler, not-found error) is identical across platforms.
 */
export function registerReportCsvResource(opts: RegisterReportCsvResourceOptions): void {
  const { server, ResourceTemplate, store, platform, downloadToolName, logger, ownerKey } = opts;

  const template = new ResourceTemplate(`${REPORT_CSV_RESOURCE_SCHEME}://{id}`, {
    list: async (extra?: { sessionId?: string }) => {
      const callerSessionId = extra?.sessionId ?? ownerKey;
      return {
        // Tenant isolation — the same rule the read handler enforces. The store
        // is per-process and shared across every session on this instance, so an
        // unscoped `store.list()` would leak every other session's report URIs
        // and metadata (byte size, platform, timing) to any caller. Surface only
        // entries the caller owns, plus unscoped (stdio / single-tenant) entries
        // that have no session to isolate them from.
        resources: store
          .list()
          .filter((entry) => entry.sessionId === undefined || entry.sessionId === callerSessionId)
          .map((entry) => ({
            uri: buildReportCsvUri(entry.resourceId),
            name: `${platform} report CSV ${entry.resourceId}`,
            description:
              `Stored ${platform} report CSV (${entry.byteLength} bytes` +
              `${entry.truncated ? ", truncated" : ""}). ` +
              `Expires at ${new Date(entry.expiresAt).toISOString()}.`,
            mimeType: entry.mimeType,
          })),
      };
    },
  });

  server.registerResource(
    "report_csv_template",
    template,
    {
      description:
        `Raw report CSV bodies stored on demand by ${downloadToolName} (storeRawCsv: true). ` +
        `Entries expire after 30 minutes.`,
      mimeType: "text/csv",
      // #248: tenant data, never `public`. Pinned here so a server-level
      // `resources/read` policy can never widen it; the per-read hint below
      // narrows the TTL to the entry's own expiry.
      cacheHint: REPORT_CSV_CACHE_HINT,
    },
    async (uri, _variables, extra) => {
      const callerSessionId = extra?.sessionId ?? ownerKey;
      logger.info({ uri: uri.href }, "Reading report CSV resource");
      // getRemoteByUri falls back to the GCS mirror when the local store has
      // no entry — handles Cloud Run scale-out, where a follow-up read can
      // land on an instance that didn't produce the URI.
      const entry = await store.getRemoteByUri(uri.href);
      if (!entry) {
        throw reportCsvNotFound(uri.href);
      }
      // Tenant isolation. The resource id is a random UUID (a bearer capability),
      // but in a multi-tenant hosted deployment a leaked id must not let another
      // tenant read the owner's report data. A stored entry is owned by the
      // session that produced it; refuse to serve a session-scoped entry to any
      // other session. Report "not found" (not "forbidden") so a non-owner
      // cannot confirm the id even exists. Unscoped entries (no sessionId — e.g.
      // stdio / single-tenant dev) stay readable, since there is no tenant to
      // isolate them from.
      if (entry.sessionId !== undefined && entry.sessionId !== callerSessionId) {
        logger.warn(
          { uri: uri.href, event: "report_csv_cross_session_denied" },
          "Report CSV resource read denied — session mismatch"
        );
        throw reportCsvNotFound(uri.href);
      }
      return {
        // #248: private, and never cached past the entry's own expiry.
        ttlMs: Math.max(0, entry.expiresAt - Date.now()),
        cacheScope: "private" as const,
        contents: [
          {
            uri: uri.href,
            mimeType: entry.mimeType,
            text: entry.csv,
            // #204: every header and cell is platform-supplied free text
            // (campaign, ad and audience names included), so the whole body is
            // marked. Its structure has nothing finer to point into.
            _meta: untrustedResourceMeta(REPORT_CSV_UNTRUSTED_MARKER),
          },
        ],
      };
    }
  );
}
