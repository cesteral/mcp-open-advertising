// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Logger } from "pino";
import type { CM360HttpClient } from "./cm360-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";

export interface CM360ReportConfig {
  name: string;
  type: string;
  criteria?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  [key: string]: unknown;
}

export class CM360ReportingService {
  private static readonly MAX_BACKOFF_MS = 10_000;

  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: CM360HttpClient,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number = 2_000,
    private readonly maxPollAttempts: number = 60
  ) {}

  async runReport(
    profileId: string,
    config: CM360ReportConfig,
    context?: RequestContext
  ): Promise<unknown> {
    await this.rateLimiter.consume("cm360");

    // Step 1: Create report
    const report = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports`,
      context,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportId = report.id as string;

    this.logger.info(
      { reportId, requestId: context?.requestId },
      "CM360 report created"
    );

    // Step 2: Run report
    await this.rateLimiter.consume("cm360");
    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/run`,
      context,
      { method: "POST" }
    )) as Record<string, unknown>;

    const fileId = file.id as string;

    this.logger.info(
      { reportId, fileId, requestId: context?.requestId },
      "CM360 report execution started — polling for results"
    );

    // Step 3: Poll for completion
    const completedFile = await this.pollReportFile(
      profileId,
      reportId,
      fileId,
      context
    );

    const urls = (completedFile as Record<string, unknown>).urls as Record<string, string> | undefined;
    const downloadUrl = urls?.apiUrl;

    return { reportId, fileId, file: completedFile, downloadUrl };
  }

  async createReport(
    profileId: string,
    config: CM360ReportConfig,
    context?: RequestContext
  ): Promise<{ reportId: string; fileId: string }> {
    await this.rateLimiter.consume("cm360");

    const report = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports`,
      context,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportId = report.id as string;

    // Run it (non-blocking — don't poll)
    await this.rateLimiter.consume("cm360");
    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/run`,
      context,
      { method: "POST" }
    )) as Record<string, unknown>;

    const fileId = file.id as string;

    this.logger.info(
      { reportId, fileId, requestId: context?.requestId },
      "CM360 report submitted (non-blocking)"
    );

    return { reportId, fileId };
  }

  async checkReportFile(
    profileId: string,
    reportId: string,
    fileId: string,
    context?: RequestContext
  ): Promise<{
    reportId: string;
    fileId: string;
    status: string;
    file: Record<string, unknown>;
    downloadUrl?: string;
  }> {
    await this.rateLimiter.consume("cm360");

    const file = (await this.httpClient.fetch(
      `/userprofiles/${profileId}/reports/${reportId}/files/${fileId}`,
      context
    )) as Record<string, unknown>;

    const status = (file.status as string) || "PROCESSING";
    const urls = file.urls as Record<string, string> | undefined;
    const downloadUrl = urls?.apiUrl;

    return { reportId, fileId, status, file, downloadUrl };
  }

  private async pollReportFile(
    profileId: string,
    reportId: string,
    fileId: string,
    context?: RequestContext
  ): Promise<unknown> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await this.rateLimiter.consume("cm360");

      const file = (await this.httpClient.fetch(
        `/userprofiles/${profileId}/reports/${reportId}/files/${fileId}`,
        context
      )) as Record<string, unknown>;

      const status = file.status as string;

      if (status === "REPORT_AVAILABLE") {
        this.logger.info(
          { reportId, fileId, attempt, requestId: context?.requestId },
          "CM360 report available"
        );
        return file;
      }

      if (status === "FAILED" || status === "CANCELLED") {
        throw new McpError(
          JsonRpcErrorCode.InternalError,
          `CM360 report ${status.toLowerCase()}`,
          { reportId, fileId, status, file }
        );
      }

      this.logger.debug(
        { reportId, fileId, status, attempt },
        "CM360 report still processing"
      );

      await this.sleep(this.computeBackoff(attempt));
    }

    throw new McpError(
      JsonRpcErrorCode.Timeout,
      `CM360 report polling timed out after ${this.maxPollAttempts} attempts`,
      { reportId, fileId }
    );
  }

  async downloadReportFile(
    downloadUrl: string,
    timeoutMs: number = 30_000,
    context?: RequestContext
  ): Promise<Response> {
    return this.httpClient.fetchRaw(downloadUrl, timeoutMs, context, {
      method: "GET",
    });
  }

  private computeBackoff(attempt: number): number {
    // Use linear backoff capped at MAX_BACKOFF_MS to spread polls more evenly
    // and avoid wasting rate-limit tokens on aggressive early polls
    return Math.min(
      this.pollIntervalMs * (attempt + 1),
      CM360ReportingService.MAX_BACKOFF_MS
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}