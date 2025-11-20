/**
 * JSON-RPC 2.0 Error Codes
 * Based on MCP specification and JSON-RPC 2.0 standard
 */
export enum JsonRpcErrorCode {
  // Standard JSON-RPC 2.0 errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // Implementation-defined errors (-32000 to -32099)
  ServiceUnavailable = -32000,
  NotFound = -32001,
  Conflict = -32002,
  RateLimited = -32003,
  Timeout = -32004,
  Forbidden = -32005,
  Unauthorized = -32006,
  ValidationError = -32007,
}

/**
 * Map error code to HTTP status code
 */
export function mapErrorCodeToHttpStatus(code: JsonRpcErrorCode): number {
  switch (code) {
    case JsonRpcErrorCode.ParseError:
    case JsonRpcErrorCode.InvalidRequest:
    case JsonRpcErrorCode.InvalidParams:
    case JsonRpcErrorCode.ValidationError:
      return 400; // Bad Request

    case JsonRpcErrorCode.Unauthorized:
      return 401; // Unauthorized

    case JsonRpcErrorCode.Forbidden:
      return 403; // Forbidden

    case JsonRpcErrorCode.NotFound:
    case JsonRpcErrorCode.MethodNotFound:
      return 404; // Not Found

    case JsonRpcErrorCode.Conflict:
      return 409; // Conflict

    case JsonRpcErrorCode.RateLimited:
      return 429; // Too Many Requests

    case JsonRpcErrorCode.InternalError:
      return 500; // Internal Server Error

    case JsonRpcErrorCode.ServiceUnavailable:
      return 503; // Service Unavailable

    case JsonRpcErrorCode.Timeout:
      return 504; // Gateway Timeout

    default:
      return 500; // Default to Internal Server Error
  }
}
