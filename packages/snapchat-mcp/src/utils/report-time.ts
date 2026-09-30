// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat stats time bounds.
 *
 * Snap (https://developers.snap.com/api/marketing-api/Ads-API/measurement):
 * "When the DAY granularity is used start_time and end_time are required
 * values, the start_time and end_time must be the daily boundary for the
 * timezone of the Ad Account in question", and both "must fall on the start of
 * an hour". Its own examples end a one-day query at the NEXT midnight
 * (start_time=2020-01-25T00:00:00-08:00, end_time=2020-01-26T00:00:00-08:00), so
 * the end of an inclusive date range is the midnight after its last day.
 */

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Offset of `timeZone` at the instant `utcMs`, in minutes east of UTC. */
function offsetMinutesAt(utcMs: number, timeZone: string): number {
  let part: string | undefined;
  try {
    part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(utcMs))
      .find((p) => p.type === "timeZoneName")?.value;
  } catch {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Unknown ad account timezone '${timeZone}'; cannot compute day boundaries. Pass explicit startTime/endTime instead.`
    );
  }
  // "GMT" for UTC itself, otherwise "GMT-08:00" / "GMT+05:30".
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(part ?? "");
  if (!match) {
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `Could not read the UTC offset for timezone '${timeZone}' (got '${part}')`
    );
  }
  if (!match[1]) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** Local midnight of `date` (YYYY-MM-DD) in `timeZone`, as ISO 8601 with its UTC offset. */
export function zonedMidnight(date: string, timeZone: string): string {
  const m = DATE_ONLY.exec(date);
  if (!m) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Expected a YYYY-MM-DD date, got '${date}'`);
  }
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // The offset depends on the instant, which depends on the offset. Take the
  // offset at the naive UTC midnight, then re-read it at the instant that
  // produces; they differ only when a DST change falls between them.
  const first = offsetMinutesAt(asUtc, timeZone);
  const second = offsetMinutesAt(asUtc - first * 60_000, timeZone);
  return `${date}T00:00:00${formatOffset(second)}`;
}

function nextDay(date: string): string {
  const m = DATE_ONLY.exec(date);
  if (!m) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Expected a YYYY-MM-DD date, got '${date}'`);
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return d.toISOString().slice(0, 10);
}

/**
 * The `start_time` / `end_time` Snap wants for an inclusive date range in the
 * ad account's timezone: local midnight of the first day, and local midnight of
 * the day AFTER the last.
 */
export function accountDayRange(
  range: { startDate: string; endDate: string },
  timeZone: string
): { start_time: string; end_time: string } {
  return {
    start_time: zonedMidnight(range.startDate, timeZone),
    end_time: zonedMidnight(nextDay(range.endDate), timeZone),
  };
}

/**
 * Snap requires `start_time` / `end_time` to fall on the start of an hour for
 * DAY and HOUR granularity. Date-only values are accepted (Snap's own examples
 * use them); a timestamp with minutes or seconds off the hour is refused here
 * with the rule stated, instead of being sent to be rejected or shifted.
 */
export function assertOnHourBoundary(field: "start_time" | "end_time", value: string): void {
  const time = /T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(value);
  if (!time) return;
  const minutes = Number(time[2]);
  const seconds = Number(time[3] ?? 0);
  const fraction = Number(`0.${time[4] ?? 0}`);
  if (minutes !== 0 || seconds !== 0 || fraction !== 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `${field} '${value}' is not on the start of an hour. Snapchat requires start_time and end_time to fall on the start of an hour for DAY and HOUR granularity (for DAY, the ad account's day boundary): use e.g. 2026-03-01T00:00:00-08:00.`
    );
  }
}
