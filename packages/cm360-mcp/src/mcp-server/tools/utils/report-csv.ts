// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * CM360 report files are not plain CSV. A STANDARD report starts with a
 * metadata block (report name, Date/Time Generated, Report Time Zone, Account
 * ID, Date Range, ...), then a `Report Fields` line, then the real header row
 * and the data, and it ends with a `Grand Total:` row. Handing the raw body to
 * a CSV parser makes the first metadata line the header (#296).
 */

const REPORT_FIELDS_MARKER = "report fields";
const GRAND_TOTAL_PREFIX = "grand total:";

function firstCell(line: string): string {
  const comma = line.indexOf(",");
  const cell = comma === -1 ? line : line.slice(0, comma);
  return cell
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim()
    .toLowerCase();
}

/**
 * Returns the CSV a generic parser can read: the header row and data rows,
 * with the metadata block up to and including `Report Fields` removed and the
 * trailing `Grand Total:` row dropped. A body with no `Report Fields` line (a
 * report type that carries no preamble) is returned unchanged.
 */
export function stripCm360ReportPreamble(csvText: string): string {
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const markerIndex = lines.findIndex((line) => firstCell(line) === REPORT_FIELDS_MARKER);
  if (markerIndex === -1) return csvText;

  const body = lines.slice(markerIndex + 1);
  let end = body.length;
  while (end > 0) {
    const line = body[end - 1]!;
    if (line.trim() === "" || firstCell(line).startsWith(GRAND_TOTAL_PREFIX)) end--;
    else break;
  }
  return body.slice(0, end).join("\n");
}
