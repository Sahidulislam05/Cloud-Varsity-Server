import { z } from "zod";

export const updateProfileValidationSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
});

export const updateUserStatusValidationSchema = z.object({
  isActive: z.boolean({ error: "isActive must be true or false" }),
});

export const assignDepartmentValidationSchema = z.object({
  departmentId: z.string().min(1, "departmentId is required"),
});
