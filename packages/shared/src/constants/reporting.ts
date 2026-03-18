// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared defaults for async report polling services.
 *
 * Individual servers may override via constructor params, but these
 * provide a consistent baseline across Pinterest, Snapchat, Amazon DSP,
 * TikTok, and Microsoft Ads reporting services.
 */

/** Maximum backoff between poll attempts (ms). */
export const DEFAULT_REPORT_MAX_BACKOFF_MS = 10_000;

/** Default interval between poll attempts (ms). */
export const DEFAULT_REPORT_POLL_INTERVAL_MS = 2_000;

/** Default maximum number of poll attempts before timeout. */
export const DEFAULT_REPORT_MAX_POLL_ATTEMPTS = 30;

/** Timeout for downloading a completed report file (ms). */
export const DEFAULT_REPORT_DOWNLOAD_TIMEOUT_MS = 60_000;

/** Maximum report file size before truncation (bytes, 50 MB). */
export const DEFAULT_REPORT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Default maximum rows to return from a parsed report. */
export const DEFAULT_REPORT_MAX_ROWS = 10_000;

/** Log a warning when remaining poll attempts drops to this threshold. */
export const REPORT_POLL_WARNING_THRESHOLD = 3;
