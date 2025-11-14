/**
 * Security sanitization utilities
 * Prevents injection attacks and sanitizes sensitive data
 */

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");

  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Redact sensitive fields from object
 */
export function redactSensitiveFields(
  obj: any,
  sensitiveFields: string[] = [
    "password",
    "secret",
    "token",
    "apiKey",
    "accessToken",
    "refreshToken",
    "privateKey",
    "credentials",
  ]
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, sensitiveFields));
  }

  if (typeof obj === "object") {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some((field) =>
        lowerKey.includes(field.toLowerCase())
      );

      if (isSensitive && typeof value === "string") {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitiveFields(value, sensitiveFields);
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Validate and sanitize email address
 */
export function sanitizeEmail(email: string): string | null {
  const sanitized = sanitizeString(email.trim().toLowerCase());

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize URL to prevent SSRF attacks
 */
export function sanitizeUrl(url: string, allowedDomains?: string[]): string | null {
  try {
    const sanitized = sanitizeString(url.trim());
    const parsed = new URL(sanitized);

    // Only allow HTTP/HTTPS protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    // Block localhost and private IPs
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    ) {
      return null;
    }

    // Check allowed domains if provided
    if (allowedDomains && allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return null;
      }
    }

    return sanitized;
  } catch {
    return null;
  }
}

/**
 * Sanitize file path to prevent directory traversal attacks
 */
export function sanitizeFilePath(path: string): string | null {
  const sanitized = sanitizeString(path.trim());

  // Block directory traversal attempts
  if (sanitized.includes("..") || sanitized.includes("~")) {
    return null;
  }

  // Block absolute paths
  if (sanitized.startsWith("/") || /^[a-zA-Z]:/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize SQL-like filter expressions
 */
export function sanitizeFilterExpression(filter: string): string {
  // Remove potentially dangerous SQL keywords
  const dangerous = [
    "DROP",
    "DELETE",
    "INSERT",
    "UPDATE",
    "EXEC",
    "EXECUTE",
    "UNION",
    "SCRIPT",
    "JAVASCRIPT",
    "--",
    "/*",
    "*/",
    ";",
  ];

  let sanitized = sanitizeString(filter);

  for (const keyword of dangerous) {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    sanitized = sanitized.replace(regex, "");
  }

  return sanitized.trim();
}
