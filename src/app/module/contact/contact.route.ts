import { Router } from "express";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { ContactController } from "./contact.controller";
import { contactValidationSchema } from "./contact.validation";

const router = Router();

router.post(
  "/",
  authRateLimiter,
  validateRequest(contactValidationSchema),
  ContactController.sendContactMessage,
);

export const ContactRoutes = router;
