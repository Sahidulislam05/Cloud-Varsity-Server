import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { TReportQuery } from "./report.interface";
import { ReportService } from "./report.service";

const getEnrollmentReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getEnrollmentReport(
    req.query as TReportQuery,
    req.user!,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Enrollment report generated successfully",
    data: result,
  });
});

const getAttendanceReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getAttendanceReport(
    req.query as TReportQuery,
    req.user!,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Attendance report generated successfully",
    data: result,
  });
});

const getResultReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getResultReport(req.query as TReportQuery);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Result report generated successfully",
    data: result,
  });
});

const getFinanceReport = catchAsync(async (req: Request, res: Response) => {
  const result = await ReportService.getFinanceReport(
    req.query as TReportQuery,
  );
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Finance report generated successfully",
    data: result,
  });
});

export const ReportController = {
  getEnrollmentReport,
  getAttendanceReport,
  getResultReport,
  getFinanceReport,
};
