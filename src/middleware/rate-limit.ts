import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { validateAccessToken } from "../db/oauth.js";

/**
 * Rate limiter for MCP endpoints. Keyed by user ID (from bearer token)
 * so each user gets their own rate limit bucket.
 */
export const mcpRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: () => config.rateLimitPerMinute(),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const result = validateAccessToken(token);
      if (result) return result.userId;
    }
    return req.ip ?? "unknown";
  },
  message: {
    error: "rate_limit_exceeded",
    error_description: "Too many requests. Please try again in a moment.",
  },
});
