import type { Request, Response, NextFunction } from "express";
import { extractBearerToken, verifyJwt, type JwtPayload } from "./jwt.js";
import { AuthenticationError } from "../utils/errors.js";

// Extend Express Request type to include user payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Express middleware to validate JWT tokens
 */
export function authMiddleware(jwtSecret: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from Authorization header
      const token = extractBearerToken(req.headers.authorization);

      // Verify token
      const payload = await verifyJwt(token, jwtSecret);

      // Attach user to request
      req.user = payload;

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(401).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      res.status(500).json({
        error: "Authentication failed",
        code: "AUTHENTICATION_FAILED",
      });
    }
  };
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 */
export function optionalAuthMiddleware(jwtSecret: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = extractBearerToken(authHeader);
        const payload = await verifyJwt(token, jwtSecret);
        req.user = payload;
      }
      next();
    } catch (_error) {
      // Continue without authentication
      next();
    }
  };
}
