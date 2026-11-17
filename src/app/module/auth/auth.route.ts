import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import {
  authRateLimiter,
  forgotPasswordRateLimiter,
  loginRateLimiter,
  resetPasswordRateLimiter,
} from "../../middleware/rateLimiter";
import { AuthController } from "./auth.controller";
import {
  demoLoginValidationSchema,
  forgotPasswordValidationSchema,
  googleLoginValidationSchema,
  loginValidationSchema,
  registerValidationSchema,
  resetPasswordValidationSchema,
} from "./auth.validation";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validateRequest(registerValidationSchema),
  AuthController.registerUser,
);
router.post(
  "/login",
  loginRateLimiter,
  validateRequest(loginValidationSchema),
  AuthController.loginUser,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post("/logout", AuthController.logoutUser);
router.post(
  "/google",
  loginRateLimiter,
  validateRequest(googleLoginValidationSchema),
  AuthController.googleLogin,
);
router.post(
  "/demo-login",
  loginRateLimiter,
  validateRequest(demoLoginValidationSchema),
  AuthController.demoLogin,
);
router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  validateRequest(forgotPasswordValidationSchema),
  AuthController.forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordRateLimiter,
  validateRequest(resetPasswordValidationSchema),
  AuthController.resetPassword,
);

export const AuthRoutes = router;
