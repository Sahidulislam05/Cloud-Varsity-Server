
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { InstructorService } from "./instructor.service";

const getInstructors = catchAsync(async (req: Request, res: Response) => {
  const result = await InstructorService.getInstructors(req.query as { departmentId?: string }, req.user!);
  sendResponse(res, { success: true, statusCode: httpStatus.OK, message: "Instructors retrieved successfully", data: result });
});

export const InstructorController = { getInstructors };