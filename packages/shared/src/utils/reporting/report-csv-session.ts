// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { ReportCsvStore } from "./report-csv-store.js";
import { deleteSpilledObjectsForSession } from "./report-spill.js";
import type { SessionDeleteHook } from "../transport/session-store.js";

/**
 * The per-process `ReportCsvStore` a server's `*_download_report` tool fills
 * when the caller sets `storeRawCsv`, bound to the session lifecycle.
 *
 * Entries are mirrored to GCS (`REPORT_SPILL_BUCKET`, a no-op when unset) so a
 * `report-csv://` URI survives a Cloud Run scale-out. When a session closes, its
 * spilled objects under `{spillPlatform}/{sessionId}/` are swept and its
 * in-memory entries cleared. The sweep is belt-and-braces alongside the bucket's
 * 24-hour lifecycle rule (see docs/architecture/report-csv-spill.md).
 *
 * `spillPlatform` must be the slug the download tool passes to `spillCsvToGcs`
 * (the `ReportingPlatform` value, e.g. `"amazon_dsp"`): it is the object-path
 * prefix the sweep deletes under.
 */
export function createSessionBoundReportCsvStore(opts: {
  sessionServiceStore: { onDelete(hook: SessionDeleteHook): unknown };
  spillPlatform: string;
}): ReportCsvStore {
  const store = new ReportCsvStore({
    mirror: { bucketResolver: () => process.env.REPORT_SPILL_BUCKET },
  });

  opts.sessionServiceStore.onDelete((sessionId) => {
    void deleteSpilledObjectsForSession(opts.spillPlatform, sessionId);
    store.clearForSession(sessionId);
  });

  return store;
}
