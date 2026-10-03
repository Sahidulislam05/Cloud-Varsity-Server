import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ContactService } from "./contact.service";

const sendContactMessage = catchAsync(async (req: Request, res: Response) => {
  await ContactService.sendContactMessage(req.body);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Your message has been sent",
    data: null,
  });
});

export const ContactController = { sendContactMessage };
