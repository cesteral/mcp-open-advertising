import { describe, expect, it } from "vitest";
import {
  accountDayRange,
  assertOnHourBoundary,
  zonedMidnight,
} from "../../src/utils/report-time.js";

// Snapchat: "When the DAY granularity is used start_time and end_time are
// required values, the start_time and end_time must be the daily boundary for
// the timezone of the Ad Account" and "must fall on the start of an hour"
// (https://developers.snap.com/api/marketing-api/Ads-API/measurement).
describe("zonedMidnight", () => {
  it("returns local midnight with the account's UTC offset", () => {
    expect(zonedMidnight("2026-03-01", "America/Los_Angeles")).toBe("2026-03-01T00:00:00-08:00");
    expect(zonedMidnight("2026-07-01", "Europe/Stockholm")).toBe("2026-07-01T00:00:00+02:00");
    expect(zonedMidnight("2026-01-15", "UTC")).toBe("2026-01-15T00:00:00+00:00");
  });

  it("follows daylight saving changes across the year", () => {
    // US DST started 2026-03-08 at 02:00, so midnight that day is still PST and
    // midnight the next day is PDT.
    expect(zonedMidnight("2026-03-08", "America/Los_Angeles")).toBe("2026-03-08T00:00:00-08:00");
    expect(zonedMidnight("2026-03-09", "America/Los_Angeles")).toBe("2026-03-09T00:00:00-07:00");
    expect(zonedMidnight("2026-11-01", "America/Los_Angeles")).toBe("2026-11-01T00:00:00-07:00");
    expect(zonedMidnight("2026-11-02", "America/Los_Angeles")).toBe("2026-11-02T00:00:00-08:00");
  });

  it("handles fractional-hour and ahead-of-UTC zones", () => {
    expect(zonedMidnight("2026-05-10", "Asia/Kolkata")).toBe("2026-05-10T00:00:00+05:30");
    expect(zonedMidnight("2026-05-10", "Australia/Sydney")).toBe("2026-05-10T00:00:00+10:00");
  });

  it("rejects an unknown timezone with a message naming it", () => {
    expect(() => zonedMidnight("2026-03-01", "Mars/Olympus")).toThrow(/Mars\/Olympus/);
  });

  it("rejects a malformed date", () => {
    expect(() => zonedMidnight("03/01/2026", "UTC")).toThrow(/YYYY-MM-DD/);
  });
});

describe("accountDayRange", () => {
  it("runs from start-date midnight to the midnight AFTER the end date", () => {
    // Snap's own examples end a one-day query at the next midnight
    // (start 2020-01-25T00:00:00-08:00, end 2020-01-26T00:00:00-08:00).
    expect(
      accountDayRange({ startDate: "2026-03-01", endDate: "2026-03-01" }, "America/Los_Angeles")
    ).toEqual({
      start_time: "2026-03-01T00:00:00-08:00",
      end_time: "2026-03-02T00:00:00-08:00",
    });
  });

  it("uses the offset in force at each boundary, not one offset for the range", () => {
    expect(
      accountDayRange({ startDate: "2026-03-07", endDate: "2026-03-09" }, "America/Los_Angeles")
    ).toEqual({
      start_time: "2026-03-07T00:00:00-08:00",
      end_time: "2026-03-10T00:00:00-07:00",
    });
  });

  it("rolls the end date over month and year boundaries", () => {
    expect(accountDayRange({ startDate: "2026-12-31", endDate: "2026-12-31" }, "UTC")).toEqual({
      start_time: "2026-12-31T00:00:00+00:00",
      end_time: "2027-01-01T00:00:00+00:00",
    });
  });
});

describe("assertOnHourBoundary", () => {
  it("accepts date-only values and timestamps on the hour, with any offset", () => {
    for (const v of [
      "2026-03-01",
      "2026-03-01T00:00:00Z",
      "2026-03-01T22:00:00-08:00",
      "2026-03-01T22:00:00.000+05:00",
    ]) {
      expect(() => assertOnHourBoundary("start_time", v)).not.toThrow();
    }
  });

  it("rejects minutes or seconds off the hour and names the field", () => {
    // The previous datePreset end bound (T23:59:59Z) is exactly this case.
    expect(() => assertOnHourBoundary("end_time", "2026-03-04T23:59:59Z")).toThrow(/end_time/);
    expect(() => assertOnHourBoundary("start_time", "2026-03-01T22:45:00Z")).toThrow(
      /start of an hour/
    );
  });
});
