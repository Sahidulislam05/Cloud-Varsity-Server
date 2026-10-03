import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import {
  forgotPasswordValidationSchema,
  googleLoginValidationSchema,
  loginValidationSchema,
  registerValidationSchema,
  resetPasswordValidationSchema,
} from "./auth.validation";
import { loginRateLimiter } from "../../middleware/rateLimiter";

const router = Router();

router.post(
  "/register",
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
  validateRequest(googleLoginValidationSchema),
  AuthController.googleLogin,
);
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordValidationSchema),
  AuthController.forgotPassword,
);
router.post(
  "/reset-password",
  validateRequest(resetPasswordValidationSchema),
  AuthController.resetPassword,
);

export const AuthRoutes = router;
