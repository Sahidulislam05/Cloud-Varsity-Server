import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import {
  createDepartmentValidationSchema,
  updateDepartmentValidationSchema,
} from "../academics/academics.validation";
import { DepartmentController } from "./department.controller";

const departmentRouter = Router();

departmentRouter.post(
  "/",
  auth("SUPER_ADMIN"),
  validateRequest(createDepartmentValidationSchema),
  DepartmentController.createDepartment,
);
departmentRouter.get("/", DepartmentController.getAllDepartments);
departmentRouter.patch(
  "/:id",
  auth("SUPER_ADMIN"),
  validateRequest(updateDepartmentValidationSchema),
  DepartmentController.updateDepartment,
);

export const DepartmentRoutes = departmentRouter;
