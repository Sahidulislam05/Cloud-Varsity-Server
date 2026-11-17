import { prisma } from "../../lib/prisma";
import type { Role } from "../../../generated/prisma/enums";
import { departmentScopeOf } from "../../utils/assertDepartmentAccess";
import type { TReportQuery } from "./report.interface";

type TReportRequester = { role: Role; departmentId: string | null };

/**
 * Department admins only see data for their own department's programs
 * (same scoping enrollment.service applies); SUPER_ADMIN/REGISTRAR see all.
 */
const departmentScope = (requester: TReportRequester) => {
  const departmentId = departmentScopeOf(requester.role, requester.departmentId);
  return departmentId ? { course: { program: { departmentId } } } : {};
};

const getEnrollmentReport = async (
  query: TReportQuery,
  requester: TReportRequester,
) => {
  const sections = await prisma.section.findMany({
    where: {
      deletedAt: null,
      ...(query.semesterId && { semesterId: query.semesterId }),
      ...departmentScope(requester),
    },
    include: {
      course: true,
      semester: true,
      _count: {
        select: {
          registrations: {
            where: { status: { in: ["ENROLLED", "COMPLETED"] } },
          },
        },
      },
    },
  });

  return sections.map((s) => ({
    courseCode: s.course.code,
    courseTitle: s.course.title,
    section: s.name,
    semester: `${s.semester.name} ${s.semester.year}`,
    capacity: s.capacity,
    enrolled: s._count.registrations,
    seatsRemaining: s.capacity - s._count.registrations,
  }));
};

const getAttendanceReport = async (
  query: TReportQuery,
  requester: TReportRequester,
) => {
  const sections = await prisma.section.findMany({
    where: {
      deletedAt: null,
      ...(query.semesterId && { semesterId: query.semesterId }),
      ...departmentScope(requester),
    },
    include: { course: true, attendances: true },
  });

  return sections.map((s) => {
    const total = s.attendances.length;
    const present = s.attendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE",
    ).length;
    return {
      courseCode: s.course.code,
      section: s.name,
      totalRecords: total,
      averageAttendancePercentage:
        total === 0 ? 0 : Math.round((present / total) * 100),
    };
  });
};

const getResultReport = async (query: TReportQuery) => {
  const registrations = await prisma.courseRegistration.findMany({
    where: {
      status: "COMPLETED",
      ...(query.programId && { student: { programId: query.programId } }),
    },
    select: { finalGradePoint: true },
  });

  const totalGraded = registrations.length;
  const passCount = registrations.filter(
    (r) => (r.finalGradePoint ?? 0) > 0,
  ).length;
  const averageGpa =
    totalGraded === 0
      ? 0
      : Number(
          (
            registrations.reduce(
              (sum, r) => sum + (r.finalGradePoint ?? 0),
              0,
            ) / totalGraded
          ).toFixed(2),
        );

  return {
    totalRecordsGraded: totalGraded,
    passRate:
      totalGraded === 0 ? 0 : Math.round((passCount / totalGraded) * 100),
    averageGpa,
  };
};

const getFinanceReport = async (query: TReportQuery) => {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(query.semesterId && {
        feeStructure: { semesterId: query.semesterId },
      }),
    },
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.amount), 0);
  const totalCollected = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + Number(i.amount), 0);

  return {
    invoiceCount: invoices.length,
    totalInvoiced,
    totalCollected,
    totalPending: totalInvoiced - totalCollected,
  };
};

export const ReportService = {
  getEnrollmentReport,
  getAttendanceReport,
  getResultReport,
  getFinanceReport,
};
