// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Multipart form data builder for binary file uploads.
 *
 * Constructs a standards-compliant multipart/form-data request body
 * as a single Buffer for use with platform upload APIs.
 *
 * Usage:
 *   const { body, contentType } = buildMultipartFormData(fields, "file", buffer, "image.jpg", "image/jpeg");
 *   await fetch(url, { method: "POST", headers: { "Content-Type": contentType }, body });
 */

import { randomBytes } from "crypto";

export interface MultipartFormData {
  /** Raw body to send as the request body */
  body: Buffer;
  /** Full Content-Type header value including boundary, e.g. "multipart/form-data; boundary=abc123" */
  contentType: string;
  /** The boundary string (without leading dashes) */
  boundary: string;
}

/**
 * Build a multipart/form-data request body from string fields and a single file.
 *
 * @param fields - String key-value pairs to include before the file part
 * @param fileField - Form field name for the file part
 * @param fileBuffer - File contents as a Buffer
 * @param filename - Original filename for the Content-Disposition header
 * @param fileContentType - MIME type for the file part
 */
export function buildMultipartFormData(
  fields: Record<string, string>,
  fileField: string,
  fileBuffer: Buffer,
  filename: string,
  fileContentType: string
): MultipartFormData {
  const boundary = `----FormBoundary${randomBytes(12).toString("hex")}`;
  const CRLF = "\r\n";
  const dashesBoundary = `--${boundary}`;
  const closingBoundary = `--${boundary}--`;

  const parts: Buffer[] = [];

  // Add text fields
  for (const [name, value] of Object.entries(fields)) {
    const part =
      `${dashesBoundary}${CRLF}` +
      `Content-Disposition: form-data; name="${name}"${CRLF}` +
      CRLF +
      `${value}${CRLF}`;
    parts.push(Buffer.from(part, "utf-8"));
  }

  // Add file part
  const safeFilename = filename.replace(/[\r\n"]/g, "_");
  const filePart =
    `${dashesBoundary}${CRLF}` +
    `Content-Disposition: form-data; name="${fileField}"; filename="${safeFilename}"${CRLF}` +
    `Content-Type: ${fileContentType}${CRLF}` +
    CRLF;

  parts.push(Buffer.from(filePart, "utf-8"));
  parts.push(fileBuffer);
  parts.push(Buffer.from(CRLF, "utf-8"));

  // Add closing boundary
  parts.push(Buffer.from(`${closingBoundary}${CRLF}`, "utf-8"));

  const body = Buffer.concat(parts);

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    boundary,
  };
}