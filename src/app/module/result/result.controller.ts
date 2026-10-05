import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ResultService } from "./result.service";

const submitResults = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultService.submitResults(req.body, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Results submitted successfully",
    data: result,
  });
});

const publishSectionResults = catchAsync(
  async (req: Request, res: Response) => {
    const result = await ResultService.publishSectionResults(
      req.params.sectionId as string,
      req.user!.userId,
    );
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Results published successfully",
      data: result,
    });
  },
);

const getMyResults = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultService.getMyResults(req.user!.userId);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Results retrieved successfully",
    data: result,
  });
});

const getMyTranscript = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultService.getMyTranscript(req.user!.userId);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Transcript retrieved successfully",
    data: result,
  });
});

const getExamResults = catchAsync(async (req: Request, res: Response) => {
  const result = await ResultService.getExamResults(
    req.params.examId as string,
    req.user!,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Exam results retrieved successfully",
    data: result,
  });
});

export const ResultController = {
  submitResults,
  publishSectionResults,
  getMyResults,
  getMyTranscript,
  getExamResults,
};
