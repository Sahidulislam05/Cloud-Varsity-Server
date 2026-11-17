import { z } from "zod";

export const registerValidationSchema = z.object({
  name: z.string().min(2, { error: "Name must be at least 2 characters" }),
  email: z.email({ error: "Invalid email address" }),
  password: z
    .string()
    .min(6, { error: "Password must be at least 6 characters" }),
  programId: z.string().min(1, { error: "Program is required" }),
  batch: z.number().int().min(2000).max(2100),
  phone: z.string().optional(),
});

export const loginValidationSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
  password: z.string().min(1, { error: "Password is required" }),
});

export const googleLoginValidationSchema = z.object({
  idToken: z.string().min(1, { error: "Google ID token is required" }),
});

export const forgotPasswordValidationSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
});

export const resetPasswordValidationSchema = z.object({
  email: z.email({ error: "Invalid email address" }),
  otp: z.string().length(6, { error: "OTP must be 6 digits" }),
  newPassword: z
    .string()
    .min(6, { error: "Password must be at least 6 characters" }),
});

export const demoLoginValidationSchema = z.object({
  role: z.enum([
    "STUDENT",
    "INSTRUCTOR",
    "DEPARTMENT_ADMIN",
    "REGISTRAR",
    "FINANCE_ADMIN",
    "SUPER_ADMIN",
  ]),
});
