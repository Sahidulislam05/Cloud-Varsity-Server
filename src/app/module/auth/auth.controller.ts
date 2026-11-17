import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";

const isProduction = config.node_env === "production";

/**
 * The frontend reaches this API through a same-origin rewrite, so the refresh
 * cookie is first-party: SameSite=Lax works and blocks cross-site use. The
 * path limits the cookie to the auth endpoints that read it.
 */
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/api/v1/auth",
};

const refreshCookieOptions = {
  ...cookieOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/** Cookie is primary; the frontend may also send { refreshToken } in the body. */
const getRefreshToken = (req: Request): string => {
  const fromCookie = req.cookies?.refreshToken;
  if (typeof fromCookie === "string" && fromCookie.length > 0) {
    return fromCookie;
  }
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)
    ?.refreshToken;
  return typeof fromBody === "string" && fromBody.length > 0 ? fromBody : "";
};

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie("refreshToken", refreshToken, refreshCookieOptions);
};

const registerUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerUser(req.body);
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Registered successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.loginUser(req.body);
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged in successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.refreshAccessToken(getRefreshToken(req));
  // Rotation: the old refresh token is spent, store the new one.
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Access token refreshed",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
  await AuthService.logoutUser(getRefreshToken(req));
  res.clearCookie("refreshToken", cookieOptions);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged out successfully",
    data: null,
  });
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.googleLogin(req.body);
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged in with Google successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const demoLogin = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.demoLogin(req.body);
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged in to the demo account successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.forgotPassword(req.body);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "If this email is registered, an OTP has been sent",
    data: null,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Password reset successfully",
    data: null,
  });
});

export const AuthController = {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  googleLogin,
  demoLogin,
  forgotPassword,
  resetPassword,
};
