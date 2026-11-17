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

  const alreadyPublished = await prisma.courseRegistration.findFirst({
    where: { sectionId, status: "COMPLETED" },
  });
  if (alreadyPublished) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Results for this section have already been published",
    );
  }

  const exams = await prisma.exam.findMany({ where: { sectionId } });
  if (!exams.some((exam) => exam.examType === "FINAL")) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A FINAL exam is required before results can be published",
    );
  }

  const registrations = await prisma.courseRegistration.findMany({
    where: { sectionId, status: "ENROLLED" },
  });
  if (registrations.length === 0)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No enrolled students found for this section",
    );

  const examIds = exams.map((exam) => exam.id);
  const results = await prisma.result.findMany({
    where: {
      examId: { in: examIds },
      studentId: { in: registrations.map((r) => r.studentId) },
    },
  });
  const marksByStudentExam = new Map(
    results.map((r) => [`${r.studentId}:${r.examId}`, r.obtainedMarks]),
  );

  // All-or-nothing: publishing completes every registration, after which
  // marks are locked, so every student must have marks for every exam.
  const missingMarks = registrations.flatMap((registration) =>
    exams
      .filter(
        (exam) =>
          !marksByStudentExam.has(`${registration.studentId}:${exam.id}`),
      )
      .map(() => registration.studentId),
  );
  if (missingMarks.length > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Marks are missing for ${new Set(missingMarks).size} student(s). Every enrolled student needs marks for every exam before publishing.`,
    );
  }

  const publishedAt = new Date();
  const grades = registrations.map((registration) => {
    const percentage = calculateWeightedPercentage(
      exams.map((exam) => ({
        obtainedMarks: marksByStudentExam.get(
          `${registration.studentId}:${exam.id}`,
        ) as number,
        totalMarks: exam.totalMarks,
        examType: exam.examType,
      })),
    );
    return { registration, ...calculateGrade(percentage) };
  });

  await prisma.$transaction([
    prisma.result.updateMany({
      where: { examId: { in: examIds } },
      data: { publishedAt },
    }),
    ...grades.map(({ registration, gradeLetter, gradePoint }) =>
      prisma.courseRegistration.update({
        where: { id: registration.id },
        data: {
          status: "COMPLETED",
          finalGradeLetter: gradeLetter,
          finalGradePoint: gradePoint,
          completedAt: publishedAt,
        },
      }),
    ),
  ]);

  const affectedStudentIds = registrations.map((r) => r.studentId);
  for (const studentId of affectedStudentIds) {
    await recalculateCgpa(studentId);
  }

  const updatedRegistrations = await prisma.courseRegistration.findMany({
    where: { id: { in: registrations.map((r) => r.id) } },
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
    newValue: { publishedFor: affectedStudentIds.length },
  });

  return { publishedFor: affectedStudentIds.length };
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
