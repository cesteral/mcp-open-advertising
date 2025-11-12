import { Request, Response, NextFunction } from "express";
import { validateAccessToken } from "./google-auth"; // Import the validation function

// Extend Express Request type to include userAccessToken
declare global {
  namespace Express {
    interface Request {
      userAccessToken?: string;
      // You could also add userEmail or other token info here if needed
      // tokenInfo?: any;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Unauthorized: Missing or invalid Authorization header.",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: Missing token." });
  }

  try {
    // Validate the token using the function from googleAuth
    // You might choose to skip validation here and let the Google API call fail,
    // but validating upfront gives a better error message sooner.
    await validateAccessToken(token);

    // Attach the token to the request object for controllers to use
    req.userAccessToken = token;
    // req.tokenInfo = tokenInfo; // Optionally attach decoded info

    console.log("Auth middleware: Token validated and attached to request.");
    next(); // Token is valid, proceed to the next handler
  } catch (error: any) {
    console.error("Auth middleware error:", error.message);
    // If validation fails (invalid, expired, etc.)
    return res.status(401).json({ message: `Unauthorized: ${error.message}` });
  }
};
