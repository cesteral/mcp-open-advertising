// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { registerReportCsvResource } from "../../src/utils/report-csv-resource.js";
import { ReportCsvStore } from "../../src/utils/report-csv-store.js";

// Fake ResourceTemplate class that captures its ctor arguments so we can
// replay the `list` callback in assertions without pulling in the SDK.
class FakeResourceTemplate {
  readonly uriTemplate: string;
  readonly listCallback: () => Promise<unknown>;
  constructor(uriTemplate: string, options: { list: () => Promise<unknown> }) {
    this.uriTemplate = uriTemplate;
    this.listCallback = options.list;
  }
}

function createFakeServer() {
  const registered: Array<{
    name: string;
    template: FakeResourceTemplate;
    metadata: { description?: string; mimeType?: string };
    handler: (uri: { href: string }) => Promise<unknown>;
  }> = [];
  const server = {
    registerResource(
      name: string,
      template: unknown,
      metadata: { description?: string; mimeType?: string },
      handler: (uri: { href: string }) => Promise<unknown>
    ) {
      registered.push({
        name,
        template: template as FakeResourceTemplate,
        metadata,
        handler,
      });
    },
  };
  return { server, registered };
}

describe("registerReportCsvResource", () => {
  const logger = pino({ level: "silent" });

  it("registers a report_csv_template resource with the correct URI pattern", () => {
    const store = new ReportCsvStore();
    const { server, registered } = createFakeServer();

    registerReportCsvResource({
      server,
      ResourceTemplate: FakeResourceTemplate as any,
      store,
      platform: "TTD",
      downloadToolName: "ttd_download_report",
      logger,
    });

    expect(registered).toHaveLength(1);
    expect(registered[0]!.name).toBe("report_csv_template");
    expect(registered[0]!.template.uriTemplate).toBe("report-csv://{id}");
    expect(registered[0]!.metadata.mimeType).toBe("text/csv");
    expect(registered[0]!.metadata.description).toContain("ttd_download_report");
  });

  it("lists stored entries with platform-scoped names and descriptions", async () => {
    const store = new ReportCsvStore();
    const entry = store.store({
      csv: "a,b\n1,2\n",
      mimeType: "text/csv",
      sessionId: "s-1",
    });

    const { server, registered } = createFakeServer();
    registerReportCsvResource({
      server,
      ResourceTemplate: FakeResourceTemplate as any,
      store,
      platform: "Snapchat",
      downloadToolName: "snapchat_download_report",
      logger,
    });

    const listResult = (await registered[0]!.template.listCallback()) as {
      resources: Array<{
        uri: string;
        name: string;
        description: string;
        mimeType: string;
      }>;
    };
    expect(listResult.resources).toHaveLength(1);
    expect(listResult.resources[0]!.uri).toBe(`report-csv://${entry.resourceId}`);
    expect(listResult.resources[0]!.name).toContain("Snapchat");
    expect(listResult.resources[0]!.description).toContain("Stored Snapchat report CSV");
    expect(listResult.resources[0]!.mimeType).toBe("text/csv");
  });

  it("resolves a known URI to the stored CSV body", async () => {
    const store = new ReportCsvStore();
    const entry = store.store({
      csv: "col\n42\n",
      sessionId: "s-2",
    });

    const { server, registered } = createFakeServer();
    registerReportCsvResource({
      server,
      ResourceTemplate: FakeResourceTemplate as any,
      store,
      platform: "TTD",
      downloadToolName: "ttd_download_report",
      logger,
    });

    const readResult = (await registered[0]!.handler({
      href: `report-csv://${entry.resourceId}`,
    })) as {
      contents: Array<{ uri: string; mimeType: string; text: string }>;
    };
    expect(readResult.contents).toHaveLength(1);
    expect(readResult.contents[0]!.text).toBe("col\n42\n");
    expect(readResult.contents[0]!.mimeType).toBe("text/csv");
  });

  it("throws a not-found error for unknown or expired URIs", async () => {
    const store = new ReportCsvStore();
    const { server, registered } = createFakeServer();
    registerReportCsvResource({
      server,
      ResourceTemplate: FakeResourceTemplate as any,
      store,
      platform: "TTD",
      downloadToolName: "ttd_download_report",
      logger,
    });

    await expect(registered[0]!.handler({ href: "report-csv://does-not-exist" })).rejects.toThrow(
      /not found or expired/
    );
  });

  it("logs an info line when serving a resource", async () => {
    const store = new ReportCsvStore();
    const entry = store.store({ csv: "x\n1\n" });
    const loggerSpy = pino({ level: "silent" });
    const infoSpy = vi.spyOn(loggerSpy, "info");

    const { server, registered } = createFakeServer();
    registerReportCsvResource({
      server,
      ResourceTemplate: FakeResourceTemplate as any,
      store,
      platform: "TTD",
      downloadToolName: "ttd_download_report",
      logger: loggerSpy,
    });

    await registered[0]!.handler({
      href: `report-csv://${entry.resourceId}`,
    });
    expect(infoSpy).toHaveBeenCalledWith(
      { uri: `report-csv://${entry.resourceId}` },
      "Reading report CSV resource"
    );
  });
});
