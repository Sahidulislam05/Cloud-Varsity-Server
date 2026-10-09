import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import { assertDepartmentAccess } from "../../utils/assertDepartmentAccess";
import type { Role } from "../../../generated/prisma/enums";
import { TCreateSectionPayload } from "../academics/academics.interface";
import { assertSectionAccess } from "../../utils/assertSectionAccess";

const createSection = async (
  payload: TCreateSectionPayload,
  requester: { role: Role; departmentId: string | null },
) => {
  const course = await prisma.course.findFirst({
    where: { id: payload.courseId, deletedAt: null },
    include: { program: true },
  });
  if (!course) throw new AppError(httpStatus.BAD_REQUEST, "Invalid course");

  assertDepartmentAccess(
    requester.role,
    requester.departmentId,
    course.program.departmentId,
  );

  const semester = await prisma.semester.findUnique({
    where: { id: payload.semesterId },
  });
  if (!semester) throw new AppError(httpStatus.BAD_REQUEST, "Invalid semester");

  const instructor = await prisma.instructorProfile.findFirst({
    where: { id: payload.instructorId },
  });
  if (!instructor)
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid instructor");

  const existing = await prisma.section.findUnique({
    where: {
      courseId_semesterId_name: {
        courseId: payload.courseId,
        semesterId: payload.semesterId,
        name: payload.name,
      },
    },
  });
  if (existing)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This section already exists for this course and semester",
    );

  return prisma.section.create({ data: payload });
};

const getAllSections = async (query: {
  semesterId?: string;
  courseId?: string;
  departmentId?: string;
}) => {
  return prisma.section.findMany({
    where: {
      deletedAt: null,
      ...(query.semesterId && { semesterId: query.semesterId }),
      ...(query.courseId && { courseId: query.courseId }),
      ...(query.departmentId && {
        course: { program: { departmentId: query.departmentId } },
      }),
    },
    include: {
      course: true,
      semester: true,
      instructor: {
        include: { user: { select: { name: true, email: true } } },
      },
      _count: { select: { registrations: { where: { status: "ENROLLED" } } } },
    },
  });
};

const getMySections = async (userId: string) => {
  const instructorProfile = await prisma.instructorProfile.findUnique({
    where: { userId },
  });
  if (!instructorProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Instructor profile not found");

  return prisma.section.findMany({
    where: { instructorId: instructorProfile.id, deletedAt: null },
    include: {
      course: true,
      semester: true,
      _count: { select: { registrations: { where: { status: "ENROLLED" } } } },
    },
  });
};

const deleteSection = async (
  id: string,
  requester: { role: Role; departmentId: string | null },
) => {
  const section = await prisma.section.findFirst({
    where: { id, deletedAt: null },
    include: { course: { include: { program: true } } },
  });
  if (!section) throw new AppError(httpStatus.NOT_FOUND, "Section not found");

  assertDepartmentAccess(
    requester.role,
    requester.departmentId,
    section.course.program.departmentId,
  );

  return prisma.section.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};

const getSectionStudents = async (
  sectionId: string,
  requester: { userId: string; role: Role; departmentId: string | null },
) => {
  // instructor হলে section টা তার নিজের কিনা, department admin হলে নিজের department এর কিনা, সেই যাচাই
  await assertSectionAccess(sectionId, requester);

  const registrations = await prisma.courseRegistration.findMany({
    where: { sectionId, status: "ENROLLED" },
    select: {
      student: {
        select: {
          id: true,
          studentId: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { student: { studentId: "asc" } },
  });

  return registrations.map(({ student }) => ({
    id: student.id, // StudentProfile.id: attendance আর result এর API এ এটাই "studentId"
    studentId: student.studentId,
    name: student.user.name,
    email: student.user.email,
  }));
};

export const SectionService = {
  createSection,
  getAllSections,
  getMySections,
  deleteSection,
  getSectionStudents,
};
