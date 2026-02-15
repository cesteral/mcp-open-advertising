/**
 * Base error class for Cesteral errors
 */
export class CesteralError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends CesteralError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends CesteralError {
  constructor(message: string = "Authentication required", details?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, details);
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends CesteralError {
  constructor(message: string = "Insufficient permissions", details?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, details);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends CesteralError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "NOT_FOUND", 404, details);
  }
}

/**
 * External API error (502)
 */
export class ExternalApiError extends CesteralError {
  constructor(
    message: string,
    public readonly platform: string,
    details?: Record<string, unknown>
  ) {
    super(message, "EXTERNAL_API_ERROR", 502, details);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends CesteralError {
  constructor(message: string = "Rate limit exceeded", details?: Record<string, unknown>) {
    super(message, "RATE_LIMIT_ERROR", 429, details);
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends CesteralError {
  constructor(message: string = "Internal server error", details?: Record<string, unknown>) {
    super(message, "INTERNAL_SERVER_ERROR", 500, details);
  }
}

/**
 * Format error for MCP response
 */
export function formatErrorForMcp(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  if (error instanceof CesteralError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              code: error.code,
              details: error.details,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  if (error instanceof Error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              code: "UNKNOWN_ERROR",
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: "An unknown error occurred",
            code: "UNKNOWN_ERROR",
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
