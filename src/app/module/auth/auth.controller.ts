import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";

// const cookieOptions = {
//   httpOnly: true,
//   secure: config.node_env === "production",
//   sameSite: "strict" as const,
// };

const cookieOptions = {
  httpOnly: true,
  secure: config.node_env === "production",
  sameSite:
    config.node_env === "production" ? ("none" as const) : ("lax" as const),
};

const registerUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerUser(req.body);
  res.cookie("refreshToken", result.refreshToken, cookieOptions);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Registered successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.loginUser(req.body);
  res.cookie("refreshToken", result.refreshToken, cookieOptions);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged in successfully",
    data: { accessToken: result.accessToken, user: result.user },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.refreshAccessToken(req.cookies.refreshToken);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Access token refreshed",
    data: result,
  });
});

const logoutUser = catchAsync(async (req: Request, res: Response) => {
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
  res.cookie("refreshToken", result.refreshToken, cookieOptions);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Logged in with Google successfully",
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
  forgotPassword,
  resetPassword,
};
