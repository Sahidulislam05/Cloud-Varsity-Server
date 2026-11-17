
import httpStatus from "http-status";
import type { Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import { assertSectionAccess } from "../../utils/assertSectionAccess";
import type { TCreateExamPayload } from "./exam.interface";

type TRequester = { userId: string; role: Role; departmentId: string | null };

const createExam = async (payload: TCreateExamPayload, requester: TRequester) => {
  const { instructorProfileId } = await assertSectionAccess(payload.sectionId, requester);
  if (!instructorProfileId) {
    throw new AppError(httpStatus.FORBIDDEN, "Only the assigned instructor can create exams for this section");
  }

  const published = await prisma.courseRegistration.findFirst({
    where: { sectionId: payload.sectionId, status: "COMPLETED" },
  });
  if (published) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Results for this section have already been published; no new exams can be added",
    );
  }

  return prisma.exam.create({
    data: {
      sectionId: payload.sectionId,
      examType: payload.examType,
      title: payload.title,
      totalMarks: payload.totalMarks,
      examDate: new Date(payload.examDate),
      createdById: instructorProfileId,
    },
  });
};

const getExamsForSection = async (sectionId: string, requester: TRequester) => {
  await assertSectionAccess(sectionId, requester);
  return prisma.exam.findMany({ where: { sectionId }, orderBy: { examDate: "asc" } });
};

const getMyUpcomingExams = async (userId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!studentProfile) throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const registrations = await prisma.courseRegistration.findMany({
    where: { studentId: studentProfile.id, status: "ENROLLED" },
    select: { sectionId: true },
  });

  return prisma.exam.findMany({
    where: { sectionId: { in: registrations.map((r) => r.sectionId) } },
    include: { section: { include: { course: true } } },
    orderBy: { examDate: "asc" },
  });
};

export const ExamService = { createExam, getExamsForSection, getMyUpcomingExams };