import type { Logger } from "pino";
import type { TtdHttpClient } from "./ttd-http-client.js";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { RequestContext } from "@cesteral/shared";

/**
 * Report configuration for TTD MyReports API.
 */
export interface TtdReportConfig {
  ReportName: string;
  ReportScheduleType: "Once" | "Daily" | "Weekly" | "Monthly";
  ReportDateRange: string;
  ReportFilters?: Array<{
    Type: string;
    Value: string;
  }>;
  ReportDimensions?: string[];
  ReportMetrics?: string[];
  AdvertiserFilters?: string[];
  [key: string]: unknown;
}

/**
 * TTD Reporting Service — Async report workflow.
 *
 * TTD reports follow an async pattern:
 * 1. Create a report schedule
 * 2. Poll for execution completion
 * 3. Download the result
 */
export class TtdReportingService {
  private static readonly POLL_INTERVAL_MS = 5_000;
  private static readonly MAX_POLL_ATTEMPTS = 60; // 5 min max

  constructor(
    private readonly logger: Logger,
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: TtdHttpClient
  ) {}

  /**
   * Create and run a report, polling until completion.
   */
  async runReport(
    config: TtdReportConfig,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;
    await this.rateLimiter.consume(`ttd:${partnerId}`);

    // Create report schedule
    const schedule = (await this.httpClient.fetch(
      "/myreports/reportschedule",
      context,
      {
        method: "POST",
        body: JSON.stringify(config),
      }
    )) as Record<string, unknown>;

    const reportScheduleId = schedule.ReportScheduleId as string;

    this.logger.info(
      { reportScheduleId, requestId: context?.requestId },
      "Report schedule created — polling for results"
    );

    // Poll for completion
    const execution = await this.pollReportExecution(
      reportScheduleId,
      context
    );

    // Get the download URL and fetch results
    const downloadUrl = (execution as Record<string, unknown>).ReportDeliveries as Array<Record<string, unknown>> | undefined;
    if (downloadUrl && downloadUrl.length > 0) {
      const deliveryUrl = downloadUrl[0].DownloadURL as string | undefined;
      if (deliveryUrl) {
        return { reportScheduleId, execution, downloadUrl: deliveryUrl };
      }
    }

    return { reportScheduleId, execution };
  }

  private async pollReportExecution(
    reportScheduleId: string,
    context?: RequestContext
  ): Promise<unknown> {
    const partnerId = this.httpClient.partnerId;

    for (
      let attempt = 0;
      attempt < TtdReportingService.MAX_POLL_ATTEMPTS;
      attempt++
    ) {
      await this.rateLimiter.consume(`ttd:${partnerId}`);

      const body = {
        ReportScheduleIds: [reportScheduleId],
        PageSize: 1,
      };

      const result = (await this.httpClient.fetch(
        "/myreports/reportexecution/query",
        context,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )) as Record<string, unknown>;

      const executions = (result.Result as Array<Record<string, unknown>>) || [];
      if (executions.length > 0) {
        const execution = executions[0];
        const state = execution.ReportExecutionState as string;

        if (state === "Complete") {
          this.logger.info(
            { reportScheduleId, attempt, requestId: context?.requestId },
            "Report execution complete"
          );
          return execution;
        }

        if (state === "Failed") {
          throw new Error(
            `Report execution failed: ${JSON.stringify(execution)}`
          );
        }

        this.logger.debug(
          { reportScheduleId, state, attempt },
          "Report still processing"
        );
      }

      await this.sleep(TtdReportingService.POLL_INTERVAL_MS);
    }

    throw new Error(
      `Report polling timed out after ${TtdReportingService.MAX_POLL_ATTEMPTS} attempts`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
