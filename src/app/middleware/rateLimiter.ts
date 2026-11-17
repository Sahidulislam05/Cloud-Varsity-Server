import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import httpStatus from "http-status";

const rateLimitMessage = (message: string) => ({
  success: false,
  statusCode: httpStatus.TOO_MANY_REQUESTS,
  message,
  errors: [{ message }],
});

// Prefer x-real-ip: Vercel sets it on every request and clients cannot forge
// it behind Vercel's proxy. Fall back to req.ip in other environments —
// wrapped in ipKeyGenerator so IPv6 addresses are subnet-normalized.
const keyGenerator = (req: Request) => {
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
  return req.ip ? ipKeyGenerator(req.ip) : "unknown";
};

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage(
    "Too many requests from this IP, please try again later",
  ),
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage("Too many attempts, please try again later"),
});

// OTP requests are email-sending endpoints — keep them much tighter.
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage(
    "Too many OTP requests, please try again in 15 minutes",
  ),
});

export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage(
    "Too many password reset attempts, please try again in 15 minutes",
  ),
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: rateLimitMessage(
    "Too many failed login attempts, please try again later",
  ),
});
