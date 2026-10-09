
import type { Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";

type TRequester = { role: Role; departmentId: string | null };

const getInstructors = async (query: { departmentId?: string }, requester: TRequester) => {
  
  const departmentId = requester.role === "DEPARTMENT_ADMIN" ? requester.departmentId : query.departmentId;

  
  if (requester.role === "DEPARTMENT_ADMIN" && !departmentId) return [];

  return prisma.instructorProfile.findMany({
    where: { user: { deletedAt: null, isActive: true }, ...(departmentId && { departmentId }) },
    select: {
      id: true,
      employeeId: true,
      designation: true,
      departmentId: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { employeeId: "asc" },
  });
};

export const InstructorService = { getInstructors };