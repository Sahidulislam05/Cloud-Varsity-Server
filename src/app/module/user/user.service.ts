import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import type {
  TAssignDepartmentPayload,
  TCreateStaffUserPayload,
  TStaffRole,
  TUpdateProfilePayload,
  TUserListQuery,
} from "./user.interface";
import { AuditService } from "../audit/audit.service";
import { frontendUrl } from "../../utils/frontendUrl";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";
import { parsePagination } from "../../utils/pagination";

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
  const { page, limit, skip } = parsePagination(query);

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

const STAFF_ROLE_LABELS: Record<TStaffRole, string> = {
  INSTRUCTOR: "Instructor",
  DEPARTMENT_ADMIN: "Department Admin",
  REGISTRAR: "Registrar",
  FINANCE_ADMIN: "Finance Admin",
};

/**
 * Creates a staff account without a password. The new user sets one through
 * the forgot-password (OTP) flow linked in the email, so no administrator
 * ever knows or transmits it.
 */
const createStaffUser = async (
  payload: TCreateStaffUserPayload,
  performedBy: string,
) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (existingUser) {
    throw new AppError(httpStatus.CONFLICT, "This email is already registered");
  }

  if (payload.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: payload.departmentId, deletedAt: null },
    });
    if (!department)
      throw new AppError(httpStatus.NOT_FOUND, "Department not found");
  }

  if (payload.employeeId) {
    const existingEmployee = await prisma.instructorProfile.findUnique({
      where: { employeeId: payload.employeeId },
    });
    if (existingEmployee) {
      throw new AppError(httpStatus.CONFLICT, "This employee ID is already in use");
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        role: payload.role,
        // Department admins are scoped through User.departmentId; instructors
        // through their InstructorProfile.
        departmentId:
          payload.role === "DEPARTMENT_ADMIN" ? payload.departmentId : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (payload.role === "INSTRUCTOR") {
      await tx.instructorProfile.create({
        data: {
          userId: created.id,
          employeeId: payload.employeeId as string,
          departmentId: payload.departmentId as string,
          designation: payload.designation as string,
        },
      });
    }

    return created;
  });

  await AuditService.logAction({
    userId: performedBy,
    action: "CREATE_STAFF_USER",
    entityName: "User",
    entityId: user.id,
    newValue: { email: user.email, role: user.role },
  });

  await sendTemplatedEmail(
    user.email,
    "Your CloudVarsity account is ready",
    "staff-account-created",
    {
      name: user.name,
      email: user.email,
      roleLabel: STAFF_ROLE_LABELS[payload.role],
      setPasswordUrl: frontendUrl("/forgot-password").toString(),
    },
  );

  return user;
};

export const UserService = {
  createStaffUser,
  getMe,
  updateMe,
  getAllUsers,
  updateUserStatus,
  assignDepartment,
};
