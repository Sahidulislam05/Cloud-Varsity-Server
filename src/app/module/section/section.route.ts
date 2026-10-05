import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { createSectionValidationSchema } from "../academics/academics.validation";
import { SectionController } from "./section.controller";

const sectionRouter = Router();
sectionRouter.post(
  "/",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  validateRequest(createSectionValidationSchema),
  SectionController.createSection,
);
sectionRouter.get(
  "/my-sections",
  auth("INSTRUCTOR"),
  SectionController.getMySections,
);
sectionRouter.get("/", auth(), SectionController.getAllSections);
sectionRouter.delete(
  "/:id",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  SectionController.deleteSection,
);

sectionRouter.get(
  "/:id/students",
  auth("INSTRUCTOR", "DEPARTMENT_ADMIN", "REGISTRAR", "SUPER_ADMIN"),
  SectionController.getSectionStudents,
);

export const SectionRoutes = sectionRouter;
