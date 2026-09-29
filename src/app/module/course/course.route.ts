import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import {
  createCourseValidationSchema,
  updateCourseValidationSchema,
} from "../academics/academics.validation";
import { CourseController } from "./course.controller";

const courseRouter = Router();
courseRouter.post(
  "/",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  validateRequest(createCourseValidationSchema),
  CourseController.createCourse,
);
courseRouter.get("/", CourseController.getAllCourses);
courseRouter.get("/:id", CourseController.getSingleCourse);
courseRouter.patch(
  "/:id",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  validateRequest(updateCourseValidationSchema),
  CourseController.updateCourse,
);
courseRouter.delete(
  "/:id",
  auth("SUPER_ADMIN", "DEPARTMENT_ADMIN"),
  CourseController.deleteCourse,
);

export const CourseRoutes = courseRouter;
