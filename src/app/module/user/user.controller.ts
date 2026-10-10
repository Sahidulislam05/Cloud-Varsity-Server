// src/app/module/user/user.controller.ts
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { TUserListQuery } from "./user.interface";
import { UserService } from "./user.service";

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getMe(req.user!.userId);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Profile retrieved successfully",
    data: result,
  });
});

const updateMe = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.updateMe(req.user!.userId, req.body);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Profile updated successfully",
    data: result,
  });
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.getAllUsers(req.query as TUserListQuery);
  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Users retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.updateUserStatus(
    req.params.id as string,
    req.body.isActive,
    req.user!.userId,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "User status updated successfully",
    data: result,
  });
});

const assignDepartment = catchAsync(async (req: Request, res: Response) => {
  const result = await UserService.assignDepartment(
    req.params.id,
    req.body,
    req.user!.userId,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: "Department assigned successfully",
    data: result,
  });
});

export const UserController = {
  getMe,
  updateMe,
  getAllUsers,
  updateUserStatus,
  assignDepartment,
};
