import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { InstructorController } from "./instructor.controller";

const router = Router();

router.get(
  "/",
  auth("DEPARTMENT_ADMIN", "REGISTRAR", "SUPER_ADMIN"),
  InstructorController.getInstructors,
);

export const InstructorRoutes = router;
