import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import { assertDepartmentAccess } from "../../utils/assertDepartmentAccess";
import type {
  TCourseListQuery,
  TCreateCoursePayload,
  TUpdateCoursePayload,
} from "../academics/academics.interface";
import type { Role } from "../../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { parsePagination } from "../../utils/pagination";

const createCourse = async (
  payload: TCreateCoursePayload,
  requester: { role: Role; departmentId: string | null },
) => {
  const program = await prisma.program.findFirst({
    where: { id: payload.programId, deletedAt: null },
  });
  if (!program) throw new AppError(httpStatus.BAD_REQUEST, "Invalid program");

  assertDepartmentAccess(
    requester.role,
    requester.departmentId,
    program.departmentId,
  );

  const existing = await prisma.course.findUnique({
    where: { code: payload.code },
  });
  if (existing)
    throw new AppError(httpStatus.BAD_REQUEST, "Course code already exists");

  const { prerequisiteCourseIds, ...courseData } = payload;

  return prisma.$transaction(async (tx) => {
    const course = await tx.course.create({ data: courseData });

    if (prerequisiteCourseIds?.length) {
      await tx.coursePrerequisite.createMany({
        data: prerequisiteCourseIds.map((prerequisiteCourseId) => ({
          courseId: course.id,
          prerequisiteCourseId,
        })),
      });
    }

    return course;
  });
};

const getSortOrderBy = (sortBy?: string, sortOrder?: string) => {
  const order = sortOrder === "asc" ? "asc" : "desc";
  switch (sortBy) {
    case "title":
      return { title: order } as const;
    case "code":
      return { code: order } as const;
    case "creditHours":
      return { creditHours: order } as const;
    default:
      return { createdAt: order } as const;
  }
};

const getAllCourses = async (query: TCourseListQuery) => {
  const { page, limit, skip } = parsePagination(query);

  const where = {
    deletedAt: null,
    ...(query.programId && { programId: query.programId }),
    ...(query.departmentId && {
      program: { departmentId: query.departmentId },
    }),
    ...(query.search && {
      OR: [
        { title: { contains: query.search, mode: "insensitive" as const } },
        { code: { contains: query.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      skip,
      take: limit,
      orderBy: getSortOrderBy(query.sortBy, query.sortOrder),
    }),
    prisma.course.count({ where }),
  ]);

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: courses,
  };
};

const getSingleCourse = async (id: string) => {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: { prerequisites: { include: { prerequisiteCourse: true } } },
  });
  if (!course) throw new AppError(httpStatus.NOT_FOUND, "Course not found");
  return course;
};

const updateCourse = async (
  id: string,
  payload: TUpdateCoursePayload,
  requester: { role: Role; departmentId: string | null },
) => {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: { program: true },
  });
  if (!course) throw new AppError(httpStatus.NOT_FOUND, "Course not found");

  assertDepartmentAccess(
    requester.role,
    requester.departmentId,
    course.program.departmentId,
  );

  return prisma.course.update({ where: { id }, data: payload });
};

const deleteCourse = async (
  id: string,
  requester: { userId: string; role: Role; departmentId: string | null },
) => {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: { program: true },
  });
  if (!course) throw new AppError(httpStatus.NOT_FOUND, "Course not found");

  assertDepartmentAccess(
    requester.role,
    requester.departmentId,
    course.program.departmentId,
  );

  const deleted = await prisma.course.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await AuditService.logAction({
    userId: requester.userId,
    action: "DELETE_COURSE",
    entityName: "Course",
    entityId: id,
    oldValue: { title: course.title, code: course.code },
  });

  return deleted;
};
export const CourseService = {
  createCourse,
  getAllCourses,
  getSingleCourse,
  updateCourse,
  deleteCourse,
};
