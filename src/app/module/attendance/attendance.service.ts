import httpStatus from "http-status";
import type { AttendanceStatus, Role } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/appError";
import type {
  TAttendanceListQuery,
  TMarkAttendancePayload,
} from "./attendance.interface";
import { assertSectionAccess } from "../../utils/assertSectionAccess";

type TRequester = { userId: string; role: Role; departmentId: string | null };

const normalizeDate = (date: string) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const buildSummary = (records: { status: AttendanceStatus }[]) => {
  const total = records.length;
  const present = records.filter((r) => r.status === "PRESENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;

  const presentPercentage =
    total === 0 ? 0 : Math.round(((present + late) / total) * 100);

  return { totalClasses: total, present, late, absent, presentPercentage };
};

const markAttendance = async (
  payload: TMarkAttendancePayload,
  requester: TRequester,
) => {
  const { section, instructorProfileId } = await assertSectionAccess(
    payload.sectionId,
    requester,
  );
  const date = normalizeDate(payload.date);

  const enrolledStudentIds = new Set(
    (
      await prisma.courseRegistration.findMany({
        where: { sectionId: payload.sectionId, status: "ENROLLED" },
        select: { studentId: true },
      })
    ).map((r) => r.studentId),
  );

  const invalidStudent = payload.records.find(
    (r) => !enrolledStudentIds.has(r.studentId),
  );
  if (invalidStudent) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Student ${invalidStudent.studentId} is not enrolled in this section`,
    );
  }

  const markedById = instructorProfileId ?? section.instructorId;

  return prisma.$transaction(
    payload.records.map((record) =>
      prisma.attendance.upsert({
        where: {
          studentId_sectionId_date: {
            studentId: record.studentId,
            sectionId: payload.sectionId,
            date,
          },
        },
        update: { status: record.status, markedById },
        create: {
          studentId: record.studentId,
          sectionId: payload.sectionId,
          date,
          status: record.status,
          markedById,
        },
      }),
    ),
  );
};

const getAttendanceForSection = async (
  query: TAttendanceListQuery,
  requester: TRequester,
) => {
  await assertSectionAccess(query.sectionId, requester);

  return prisma.attendance.findMany({
    where: {
      sectionId: query.sectionId,
      ...(query.date && { date: normalizeDate(query.date) }),
    },
    include: {
      student: { include: { user: { select: { name: true, email: true } } } },
    },
    orderBy: [{ date: "desc" }],
  });
};

const getSectionSummary = async (sectionId: string, requester: TRequester) => {
  await assertSectionAccess(sectionId, requester);

  const registrations = await prisma.courseRegistration.findMany({
    where: { sectionId, status: "ENROLLED" },
    include: { student: { include: { user: true } } },
  });

  const allRecords = await prisma.attendance.findMany({ where: { sectionId } });

  return registrations.map((reg) => ({
    studentId: reg.student.studentId,
    name: reg.student.user.name,
    ...buildSummary(allRecords.filter((r) => r.studentId === reg.studentId)),
  }));
};

const getMyAttendance = async (userId: string, sectionId: string) => {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!studentProfile)
    throw new AppError(httpStatus.NOT_FOUND, "Student profile not found");

  const registration = await prisma.courseRegistration.findUnique({
    where: { studentId_sectionId: { studentId: studentProfile.id, sectionId } },
  });
  if (!registration)
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not registered in this section",
    );

  const records = await prisma.attendance.findMany({
    where: { studentId: studentProfile.id, sectionId },
    orderBy: { date: "desc" },
  });

  return { records, summary: buildSummary(records) };
};

export const AttendanceService = {
  markAttendance,
  getAttendanceForSection,
  getSectionSummary,
  getMyAttendance,
};
