import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import type {
  TAssignDepartmentPayload,
  TUpdateProfilePayload,
  TUserListQuery,
} from "./user.interface";
import { AuditService } from "../audit/audit.service";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";

const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      gender: true,
      phone: true,
      avatar: true,
      isActive: true,
      createdAt: true,
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
      studentProfile: true,
      instructorProfile: true,
    },
  });

  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");
  return user;
};

const updateMe = async (userId: string, payload: TUpdateProfilePayload) => {
  return prisma.user.update({
    where: { id: userId },
    data: payload,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      gender: true,
      phone: true,
      avatar: true,
    },
  });
};

const getAllUsers = async (query: TUserListQuery) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(query.role && { role: query.role }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" as const } },
        { email: { contains: query.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: users,
  };
};

const updateUserStatus = async (
  userId: string,
  isActive: boolean,
  performedBy: string,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt)
    throw new AppError(httpStatus.NOT_FOUND, "User not found");

  if (user.role === "SUPER_ADMIN") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Super admin account cannot be deactivated",
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: { id: true, name: true, email: true, isActive: true },
  });

  await AuditService.logAction({
    userId: performedBy,
    action: "UPDATE_USER_STATUS",
    entityName: "User",
    entityId: userId,
    oldValue: { isActive: user.isActive },
    newValue: { isActive },
  });

  await sendTemplatedEmail(
    user.email,
    isActive
      ? "Your CloudVarsity Account Has Been Reactivated"
      : "Your CloudVarsity Account Has Been Deactivated",
    "account-status-changed",
    { name: user.name, isActive },
  );
  return updated;
};

const assignDepartment = async (
  userId: string,
  payload: TAssignDepartmentPayload,
  performedBy: string,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt)
    throw new AppError(httpStatus.NOT_FOUND, "User not found");

  if (user.role !== "DEPARTMENT_ADMIN")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Department can only be assigned to a Department Admin",
    );

  const department = await prisma.department.findFirst({
    where: { id: payload.departmentId, deletedAt: null },
  });
  if (!department)
    throw new AppError(httpStatus.NOT_FOUND, "Department not found");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { departmentId: payload.departmentId },
    select: {
      id: true,
      name: true,
      email: true,
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
    },
  });

  await AuditService.logAction({
    userId: performedBy,
    action: "ASSIGN_DEPARTMENT",
    entityName: "User",
    entityId: userId,
    oldValue: { departmentId: user.departmentId },
    newValue: { departmentId: payload.departmentId },
  });

  return updated;
};

export const UserService = {
  getMe,
  updateMe,
  getAllUsers,
  updateUserStatus,
  assignDepartment,
};
