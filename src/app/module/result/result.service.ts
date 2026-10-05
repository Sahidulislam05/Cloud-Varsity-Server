import httpStatus from "http-status";
import type { Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import { assertSectionAccess } from "../../utils/assertSectionAccess";
import {
  calculateGrade,
  calculateWeightedPercentage,
} from "../../utils/grading";
import type { TSubmitResultsPayload } from "./result.interface";
import { NotificationService } from "../notification/notification.service";
import { AuditService } from "../audit/audit.service";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";

type TRequester = { userId: string; role: Role; departmentId: string | null };

const submitResults = async (
  payload: TSubmitResultsPayload,
  requester: TRequester,
) => {
  const exam = await prisma.exam.findUnique({ where: { id: payload.examId } });
  if (!exam) throw new AppError(httpStatus.NOT_FOUND, "Exam not found");

  const { instructorProfileId } = await assertSectionAccess(
    exam.sectionId,
    requester,
  );
  if (!instructorProfileId || instructorProfileId !== exam.createdById) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only the instructor who created this exam can submit its results",
    );
  }

  const alreadyPublished = await prisma.courseRegistration.findFirst({
    where: { sectionId: exam.sectionId, status: "COMPLETED" },
  });
  if (alreadyPublished) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Results for this section have already been published and cannot be modified",
    );
  }

  const enrolledStudentIds = new Set(
    (
      await prisma.courseRegistration.findMany({
        where: { sectionId: exam.sectionId, status: "ENROLLED" },
        select: { studentId: true },
      })
    ).map((r) => r.studentId),
  );

  for (const record of payload.records) {
    if (!enrolledStudentIds.has(record.studentId)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Student ${record.studentId} is not enrolled in this section`,
      );
    }
    if (record.obtainedMarks > exam.totalMarks) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Obtained marks cannot exceed total marks (${exam.totalMarks})`,
      );
    }
  }

  return prisma.$transaction(
    payload.records.map((record) =>
      prisma.result.upsert({
        where: {
          examId_studentId: {
            examId: payload.examId,
            studentId: record.studentId,
          },
        },
        update: { obtainedMarks: record.obtainedMarks },
        create: {
          examId: payload.examId,
          studentId: record.studentId,
          obtainedMarks: record.obtainedMarks,
        },
      }),
    ),
  );
};

const recalculateCgpa = async (studentId: string) => {
  const completedRegistrations = await prisma.courseRegistration.findMany({
    where: { studentId, status: "COMPLETED", finalGradePoint: { not: null } },
    include: { section: { include: { course: true } } },
  });
  if (completedRegistrations.length === 0) return;

  let totalPoints = 0;
  let totalCredits = 0;
  for (const reg of completedRegistrations) {
    const credits = reg.section.course.creditHours;
    totalPoints += (reg.finalGradePoint ?? 0) * credits;
    totalCredits += credits;
  }

  const cgpa =
    totalCredits === 0 ? 0 : Number((totalPoints / totalCredits).toFixed(2));
  await prisma.studentProfile.update({
    where: { id: studentId },
    data: { cgpa },
  });
};

const publishSectionResults = async (
  sectionId: string,
  performedBy: string,
) => {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { course: true },
  });
  if (!section) throw new AppError(httpStatus.NOT_FOUND, "Section not found");

  const exams = await prisma.exam.findMany({ where: { sectionId } });
  if (exams.length === 0)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No exams found for this section",
    );

  const registrations = await prisma.courseRegistration.findMany({
    where: { sectionId, status: "ENROLLED" },
  });
  if (registrations.length === 0)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No enrolled students found for this section",
    );

  const skippedStudents: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const registration of registrations) {
      const results = await tx.result.findMany({
        where: {
          studentId: registration.studentId,
          examId: { in: exams.map((e) => e.id) },
        },
      });

      if (results.length === 0) {
        skippedStudents.push(registration.studentId);
        continue;
      }

      const resultsWithType = results.map((r) => {
        const exam = exams.find((e) => e.id === r.examId)!;
        return {
          obtainedMarks: r.obtainedMarks,
          totalMarks: exam.totalMarks,
          examType: exam.examType,
        };
      });

      const percentage = calculateWeightedPercentage(resultsWithType);
      const { gradeLetter, gradePoint } = calculateGrade(percentage);

      await tx.result.updateMany({
        where: {
          studentId: registration.studentId,
          examId: { in: exams.map((e) => e.id) },
        },
        data: { publishedAt: new Date() },
      });

      await tx.courseRegistration.update({
        where: { id: registration.id },
        data: {
          status: "COMPLETED",
          finalGradeLetter: gradeLetter,
          finalGradePoint: gradePoint,
          completedAt: new Date(),
        },
      });
    }
  });

  const affectedStudentIds = registrations
    .map((r) => r.studentId)
    .filter((id) => !skippedStudents.includes(id));
  for (const studentId of affectedStudentIds) {
    await recalculateCgpa(studentId);
  }

  const updatedRegistrations = await prisma.courseRegistration.findMany({
    where: {
      id: {
        in: registrations
          .filter((r) => !skippedStudents.includes(r.studentId))
          .map((r) => r.id),
      },
    },
    include: { student: { include: { user: true } } },
  });

  for (const reg of updatedRegistrations) {
    await NotificationService.createNotification({
      userId: reg.student.userId,
      title: "Result Published",
      message: `Your result for ${section.course.title} has been published. Check your transcript for details.`,
    });

    await sendTemplatedEmail(
      reg.student.user.email,
      "Your Results Are Published - CloudVarsity",
      "result-published",
      {
        name: reg.student.user.name,
        courseTitle: section.course.title,
        courseCode: section.course.code,
        gradeLetter: reg.finalGradeLetter,
        gradePoint: reg.finalGradePoint,
      },
    );
  }

  await AuditService.logAction({
    userId: performedBy,
    action: "PUBLISH_RESULTS",
    entityName: "Section",
    entityId: sectionId,
    newValue: {
      publishedFor: affectedStudentIds.length,
      skipped: skippedStudents.length,
    },
  });

  return { publishedFor: affectedStudentIds.length, skipped: skippedStudents };
};

const getMyResults = async (userId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  return prisma.result.findMany({
    where: { studentId: studentProfile.id, publishedAt: { not: null } },
    include: { exam: { include: { section: { include: { course: true } } } } },
    orderBy: { exam: { examDate: "desc" } },
  });
};

const getMyTranscript = async (userId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const completedRegistrations = await prisma.courseRegistration.findMany({
    where: { studentId: studentProfile.id, status: "COMPLETED" },
    include: { section: { include: { course: true, semester: true } } },
    orderBy: [{ section: { semester: { year: "asc" } } }],
  });

  const semesterMap = new Map<string, typeof completedRegistrations>();
  for (const reg of completedRegistrations) {
    const key = `${reg.section.semester.name} ${reg.section.semester.year}`;
    if (!semesterMap.has(key)) semesterMap.set(key, []);
    semesterMap.get(key)!.push(reg);
  }

  const semesters = Array.from(semesterMap.entries()).map(
    ([semesterLabel, regs]) => {
      let totalPoints = 0;
      let totalCredits = 0;
      const courses = regs.map((reg) => {
        const credits = reg.section.course.creditHours;
        totalPoints += (reg.finalGradePoint ?? 0) * credits;
        totalCredits += credits;
        return {
          courseCode: reg.section.course.code,
          courseTitle: reg.section.course.title,
          creditHours: credits,
          gradeLetter: reg.finalGradeLetter,
          gradePoint: reg.finalGradePoint,
        };
      });

      return {
        semester: semesterLabel,
        courses,
        semesterGpa:
          totalCredits === 0
            ? 0
            : Number((totalPoints / totalCredits).toFixed(2)),
      };
    },
  );

  return {
    studentId: studentProfile.studentId,
    cgpa: studentProfile.cgpa,
    semesters,
  };
};

const getExamResults = async (examId: string, requester: TRequester) => {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new AppError(httpStatus.NOT_FOUND, "Exam not found");

  await assertSectionAccess(exam.sectionId, requester);

  return prisma.result.findMany({
    where: { examId },
    select: { studentId: true, obtainedMarks: true, publishedAt: true },
  });
};

export const ResultService = {
  submitResults,
  publishSectionResults,
  getMyResults,
  getMyTranscript,
  recalculateCgpa,
  getExamResults,
};
