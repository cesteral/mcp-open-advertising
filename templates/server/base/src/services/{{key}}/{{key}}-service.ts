// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { RateLimiter, RequestContext } from "@cesteral/shared";
import type { {{Pascal}}HttpClient } from "./{{key}}-http-client.js";

export interface PageResult {
  items: Record<string, unknown>[];
  nextPageToken?: string;
}

export interface ReportQuery {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics?: string[];
  pageToken?: string;
}

/**
 * Account and report reads against the {{displayName}} API, shared by every
 * server type.
 *
 * TODO(scaffold): the paths and response shapes below are placeholders;
 * replace them from the vendor's API reference.
 */
export class {{Pascal}}Service {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: {{Pascal}}HttpClient,
    private readonly logger: Logger
  ) {}

  async listAccounts(pageToken: string | undefined, context?: RequestContext): Promise<PageResult> {
    await this.rateLimiter.consume(`{{key}}:user:${this.httpClient.quotaUser}`);
    const body = (await this.httpClient.get(
      "/accounts",
      pageToken ? { page_token: pageToken } : undefined,
      context
    )) as { data?: Record<string, unknown>[]; next_page_token?: string };
    return page(body);
  }

  /** A synchronous report: rows for the date range, one page at a time. */
  async getReport(
    accountId: string,
    query: ReportQuery,
    context?: RequestContext
  ): Promise<PageResult> {
    await this.rateLimiter.consume(`{{key}}:user:${this.httpClient.quotaUser}:account:${accountId}`);
    const params: Record<string, string> = {
      start_date: query.startDate,
      end_date: query.endDate,
    };
    if (query.dimensions?.length) params.dimensions = query.dimensions.join(",");
    if (query.metrics?.length) params.metrics = query.metrics.join(",");
    if (query.pageToken) params.page_token = query.pageToken;
    const body = (await this.httpClient.get(
      `/accounts/${encodeURIComponent(accountId)}/reports`,
      params,
      context
    )) as { data?: Record<string, unknown>[]; next_page_token?: string };
    this.logger.debug({ accountId, rows: body.data?.length ?? 0 }, "Fetched report");
    return page(body);
  }
}

function page(body: { data?: Record<string, unknown>[]; next_page_token?: string }): PageResult {
  return {
    items: body.data ?? [],
    ...(body.next_page_token ? { nextPageToken: body.next_page_token } : {}),
  };
}
