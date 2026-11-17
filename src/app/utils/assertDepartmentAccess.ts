import httpStatus from "http-status";
import type { Role } from "../../generated/prisma/enums";
import { AppError } from "./appError";

export const assertDepartmentAccess = (
  requesterRole: Role,
  requesterDepartmentId: string | null,
  targetDepartmentId: string,
) => {
  if (requesterRole === "SUPER_ADMIN") return;

  if (
    requesterRole === "DEPARTMENT_ADMIN" &&
    requesterDepartmentId === targetDepartmentId
  ) {
    return;
  }

  throw new AppError(
    httpStatus.FORBIDDEN,
    "You do not have permission to manage this department's data",
  );
};

/**
 * Department a requester's lists must be limited to: the admin's own
 * department, or null (no limit) for every other role. A department admin
 * without an assigned department is refused instead of seeing all data.
 */
export const departmentScopeOf = (
  requesterRole: Role,
  requesterDepartmentId: string | null,
): string | null => {
  if (requesterRole !== "DEPARTMENT_ADMIN") return null;
  if (!requesterDepartmentId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "No department is assigned to your account yet",
    );
  }
  return requesterDepartmentId;
};
