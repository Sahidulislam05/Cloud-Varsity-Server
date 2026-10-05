
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { SectionService } from "./section.service";

const createSection = catchAsync(async (req: Request, res: Response) => {
  const result = await SectionService.createSection(req.body, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: "Section created successfully",
    data: result,
  });
});

const getAllSections = catchAsync(async (req: Request, res: Response) => {
  const result = await SectionService.getAllSections(req.query);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Sections retrieved successfully",
    data: result,
  });
});

const getMySections = catchAsync(async (req: Request, res: Response) => {
  const result = await SectionService.getMySections(req.user!.userId);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Your sections retrieved successfully",
    data: result,
  });
});

const deleteSection = catchAsync(async (req: Request, res: Response) => {
  await SectionService.deleteSection(req.params.id as string, req.user!);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Section deleted successfully",
    data: null,
  });
});

const getSectionStudents = catchAsync(async (req: Request, res: Response) => {
  const result = await SectionService.getSectionStudents(
    req.params.id as string,
    req.user!,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Section students retrieved successfully",
    data: result,
  });
});

export const SectionController = {
  createSection,
  getAllSections,
  getMySections,
  deleteSection,
  getSectionStudents,
};
