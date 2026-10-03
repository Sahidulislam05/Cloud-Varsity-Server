import { rateLimit } from "express-rate-limit";
import httpStatus from "http-status";

const rateLimitMessage = (message: string) => ({
  success: false,
  statusCode: httpStatus.TOO_MANY_REQUESTS,
  message,
  errors: [{ message }],
});

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many requests from this IP, please try again later",
  ),
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage("Too many attempts, please try again later"),
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    "Too many failed login attempts, please try again later",
  ),
});
