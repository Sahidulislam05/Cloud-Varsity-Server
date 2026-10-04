import httpStatus from "http-status";
import type { Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import type { TRegistrationListQuery } from "./enrollment.interface";
import { NotificationService } from "../notification/notification.service";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";

const registerCourse = async (userId: string, sectionId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { semester: true, course: true },
  });
  if (!section) throw new AppError(httpStatus.NOT_FOUND, "Section not found");

  if (section.semester.status === "COMPLETED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Registration is closed for this semester",
    );
  }

  const existingRegistration = await prisma.courseRegistration.findUnique({
    where: { studentId_sectionId: { studentId: studentProfile.id, sectionId } },
  });

  if (existingRegistration?.status === "ENROLLED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You are already registered for this section",
    );
  }
  if (existingRegistration?.status === "COMPLETED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already completed this course",
    );
  }

  const prerequisites = await prisma.coursePrerequisite.findMany({
    where: { courseId: section.courseId },
    select: { prerequisiteCourseId: true },
  });

  if (prerequisites.length > 0) {
    const completed = await prisma.courseRegistration.findMany({
      where: {
        studentId: studentProfile.id,
        status: "COMPLETED",
        section: {
          courseId: { in: prerequisites.map((p) => p.prerequisiteCourseId) },
        },
      },
      select: { section: { select: { courseId: true } } },
    });

    const completedCourseIds = new Set(
      completed.map((r) => r.section.courseId),
    );
    const missingPrerequisite = prerequisites.some(
      (p) => !completedCourseIds.has(p.prerequisiteCourseId),
    );

    if (missingPrerequisite) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You have not completed the required prerequisite course(s)",
      );
    }
  }

  const registration = await prisma.$transaction(async (tx) => {
    const lockedSections = await tx.$queryRaw<
      { id: string; capacity: number }[]
    >`
      SELECT id, capacity FROM sections WHERE id = ${sectionId} FOR UPDATE
    `;

    if (!lockedSections[0]) {
      throw new AppError(httpStatus.NOT_FOUND, "Section not found");
    }

    const enrolledCount = await tx.courseRegistration.count({
      where: { sectionId, status: "ENROLLED" },
    });

    if (enrolledCount >= lockedSections[0].capacity) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "No seats available in this section",
      );
    }

    if (existingRegistration) {
      return tx.courseRegistration.update({
        where: { id: existingRegistration.id },
        data: { status: "ENROLLED", registeredAt: new Date(), droppedAt: null },
      });
    }

    return tx.courseRegistration.create({
      data: { studentId: studentProfile.id, sectionId, status: "ENROLLED" },
    });
  });

  await NotificationService.createNotification({
    userId,
    title: "Course Registration Confirmed",
    message: `You have successfully registered for ${section.course.title} (${section.name}).`,
  });

  await sendTemplatedEmail(
    studentProfile.user.email,
    "Course Registration Confirmed",
    "course-registration-confirmation",
    {
      name: studentProfile.user.name,
      courseTitle: section.course.title,
      courseCode: section.course.code,
      sectionName: section.name,
      semesterName: `${section.semester.name} ${section.semester.year}`,
      creditHours: section.course.creditHours,
    },
  );

  return registration;
};

const dropCourse = async (userId: string, registrationId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const registration = await prisma.courseRegistration.findFirst({
    where: { id: registrationId, studentId: studentProfile.id },
    include: { section: { include: { semester: true } } },
  });
  if (!registration)
    throw new AppError(httpStatus.NOT_FOUND, "Registration not found");

  if (registration.status !== "ENROLLED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This registration is not active",
    );
  }

  if (registration.section.semester.status === "COMPLETED") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot drop a course after the semester has ended",
    );
  }

  return prisma.courseRegistration.update({
    where: { id: registrationId },
    data: { status: "DROPPED", droppedAt: new Date() },
  });
};

const getMyRegistrations = async (userId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  return prisma.courseRegistration.findMany({
    where: { studentId: studentProfile.id },
    include: {
      section: {
        include: {
          course: true,
          semester: true,
          instructor: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });
};

const getAllRegistrations = async (
  query: TRegistrationListQuery,
  requester: { role: Role; departmentId: string | null },
) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const where = {
    ...(query.sectionId && { sectionId: query.sectionId }),
    ...(query.status && {
      status: query.status as "ENROLLED" | "DROPPED" | "COMPLETED",
    }),
    ...(requester.role === "DEPARTMENT_ADMIN" && {
      section: {
        course: {
          program: { departmentId: requester.departmentId ?? undefined },
        },
      },
    }),
  };

  const [registrations, total] = await Promise.all([
    prisma.courseRegistration.findMany({
      where,
      skip,
      take: limit,
      include: {
        student: { include: { user: { select: { name: true, email: true } } } },
        section: { include: { course: true, semester: true } },
      },
      orderBy: { registeredAt: "desc" },
    }),
    prisma.courseRegistration.count({ where }),
  ]);

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: registrations,
  };
};

export const EnrollmentService = {
  registerCourse,
  dropCourse,
  getMyRegistrations,
  getAllRegistrations,
};
