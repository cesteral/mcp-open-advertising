// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteSpilled = vi.fn(async () => 0);
vi.mock("../../src/utils/reporting/report-spill.js", () => ({
  deleteSpilledObjectsForSession: (...args: unknown[]) =>
    (deleteSpilled as (...a: unknown[]) => unknown)(...args),
}));

import { createSessionBoundReportCsvStore } from "../../src/utils/reporting/report-csv-session.js";
import { SessionServiceStore } from "../../src/utils/transport/session-store.js";

describe("createSessionBoundReportCsvStore", () => {
  beforeEach(() => deleteSpilled.mockClear());

  it("clears the session's entries and sweeps its spill prefix when the session is deleted", () => {
    const sessionServiceStore = new SessionServiceStore<object>();
    const store = createSessionBoundReportCsvStore({
      sessionServiceStore,
      spillPlatform: "amazon_dsp",
    });
    sessionServiceStore.set("s1", {});
    sessionServiceStore.set("s2", {});
    const mine = store.store({ csv: "a,b\n1,2", sessionId: "s1" });
    const other = store.store({ csv: "a,b\n3,4", sessionId: "s2" });

    sessionServiceStore.delete("s1");

    expect(deleteSpilled).toHaveBeenCalledTimes(1);
    expect(deleteSpilled).toHaveBeenCalledWith("amazon_dsp", "s1");
    expect(store.get(mine.resourceId)).toBeUndefined();
    expect(store.get(other.resourceId)).toBeDefined();
  });

  it("does nothing for a session the store never held", () => {
    const sessionServiceStore = new SessionServiceStore<object>();
    createSessionBoundReportCsvStore({ sessionServiceStore, spillPlatform: "ttd" });

    sessionServiceStore.delete("unknown");

    expect(deleteSpilled).not.toHaveBeenCalled();
  });
});
