import { Router } from "express";
import { UniversityController } from "./university.controller";

const universityRouter = Router();
universityRouter.get("/", UniversityController.getAllUniversities);

export const UniversityRoutes = universityRouter;
