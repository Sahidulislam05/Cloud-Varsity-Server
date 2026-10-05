import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ResultController } from "./result.controller";
import { submitResultsValidationSchema } from "./result.validation";

const router = Router();

router.post(
  "/",
  auth("INSTRUCTOR"),
  validateRequest(submitResultsValidationSchema),
  ResultController.submitResults,
);
router.patch(
  "/sections/:sectionId/publish",
  auth("REGISTRAR", "SUPER_ADMIN"),
  ResultController.publishSectionResults,
);
router.get("/my-results", auth("STUDENT"), ResultController.getMyResults);
router.get("/my-transcript", auth("STUDENT"), ResultController.getMyTranscript);
router.get(
  "/exams/:examId",
  auth("INSTRUCTOR", "DEPARTMENT_ADMIN", "REGISTRAR", "SUPER_ADMIN"),
  ResultController.getExamResults,
);

export const ResultRoutes = router;
