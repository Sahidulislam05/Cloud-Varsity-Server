import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import {
  createProgramValidationSchema,
  updateProgramValidationSchema,
} from "../academics/academics.validation";
import { ProgramController } from "./program.controller";

const programRouter = Router();
programRouter.post(
  "/",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  validateRequest(createProgramValidationSchema),
  ProgramController.createProgram,
);
programRouter.get("/", ProgramController.getAllPrograms);
programRouter.patch(
  "/:id",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  validateRequest(updateProgramValidationSchema),
  ProgramController.updateProgram,
);

export const ProgramRoutes = programRouter;
