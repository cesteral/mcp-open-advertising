// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Reads a vitest JSON report for the scaffold smoke. A test that never ran is
// not a pass: a file whose hook threw (vitest skips its tests and records no
// failed assertion) or that failed to load counts as a failure of the file.

/** Failed test full name (or `<file> (file failed)`) → failure text. */
export function failuresFromReport(report) {
  const failed = new Map();
  for (const file of report.testResults) {
    let failedTests = 0;
    for (const t of file.assertionResults) {
      if (t.status !== "failed") continue;
      failedTests++;
      failed.set(t.fullName, (t.failureMessages ?? []).join("\n"));
    }
    if (file.status === "failed" && failedTests === 0) {
      failed.set(`${file.name} (file failed)`, file.message ?? "");
    }
  }
  return failed;
}
