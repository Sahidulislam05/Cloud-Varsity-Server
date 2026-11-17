// src/app/module/user/user.route.ts
import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import {
  assignDepartmentValidationSchema,
  createStaffUserValidationSchema,
  updateProfileValidationSchema,
  updateUserStatusValidationSchema,
} from "./user.validation";

const router = Router();

router.get("/me", auth(), UserController.getMe);
router.patch(
  "/me",
  auth(),
  validateRequest(updateProfileValidationSchema),
  UserController.updateMe,
);

router.post(
  "/",
  auth("SUPER_ADMIN"),
  validateRequest(createStaffUserValidationSchema),
  UserController.createStaffUser,
);
router.get("/", auth("SUPER_ADMIN"), UserController.getAllUsers);
router.patch(
  "/:id/status",
  auth("SUPER_ADMIN"),
  validateRequest(updateUserStatusValidationSchema),
  UserController.updateUserStatus,
);
router.patch(
  "/:id/department",
  auth("SUPER_ADMIN"),
  validateRequest(assignDepartmentValidationSchema),
  UserController.assignDepartment,
);

export const UserRoutes = router;
