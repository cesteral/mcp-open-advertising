// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Download a file from a URL into a Buffer.
 *
 * Used by platform upload tools that implement the URL-proxy pattern:
 * AI agent provides a URL, server downloads the binary, uploads to platform API.
 */

import { fetchWithTimeout } from "./fetch-with-timeout.js";
import type { RequestContext } from "./request-context.js";
import path from "path";

export interface DownloadedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Download a file from a publicly accessible URL and return it as a Buffer.
 *
 * Extracts the Content-Type from the response headers and derives
 * a filename from the URL path or Content-Disposition header.
 *
 * @param url - Publicly accessible URL of the file to download
 * @param timeoutMs - Request timeout in milliseconds (default: 60s)
 * @param context - Optional request context for tracing
 */
export async function downloadFileToBuffer(
  url: string,
  timeoutMs = 60_000,
  context?: RequestContext
): Promise<DownloadedFile> {
  const response = await fetchWithTimeout(url, timeoutMs, context, {
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Failed to download file from ${url}: HTTP ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
    );
  }

  // Determine content type from response headers
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";

  // Derive filename from Content-Disposition or URL
  const filename = extractFilename(url, response.headers.get("content-disposition"), contentType);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, contentType, filename };
}

/**
 * Extract a filename from Content-Disposition header or URL path.
 */
function extractFilename(
  url: string,
  contentDisposition: string | null,
  contentType: string
): string {
  // Try Content-Disposition header first
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1].trim());
    }
  }

  // Fall back to URL path basename
  try {
    const urlObj = new URL(url);
    const basename = path.basename(urlObj.pathname);
    if (basename && basename !== "/" && !basename.startsWith("?")) {
      // Strip query params that might have ended up in the path
      return basename.split("?")[0] ?? basename;
    }
  } catch {
    // Invalid URL — fall through to default
  }

  // Last resort: derive extension from content type
  const ext = contentTypeToExtension(contentType);
  return `file${ext}`;
}

/**
 * Map common content types to file extensions.
 */
function contentTypeToExtension(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-msvideo": ".avi",
    "video/x-ms-wmv": ".wmv",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
  };
  return map[contentType] ?? "";
}
