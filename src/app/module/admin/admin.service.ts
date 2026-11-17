import { prisma } from "../../lib/prisma";
import { getRedis } from "../../lib/redis";

const DASHBOARD_CACHE_KEY = "cache:dashboard-stats";
const DASHBOARD_CACHE_TTL_SECONDS = 60;

const getDashboardStats = async () => {
  try {
    const redis = await getRedis();
    const cached = await redis.get(DASHBOARD_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (error) {
    console.error("Dashboard cache read failed, falling back to DB:", error);
  }

  const [
    totalStudents,
    totalInstructors,
    totalCourses,
    totalPrograms,
    activeSemester,
    revenue,
    pendingInvoices,
  ] = await Promise.all([
    prisma.studentProfile.count(),
    prisma.instructorProfile.count(),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.program.count({ where: { deletedAt: null } }),
    prisma.semester.findFirst({ where: { status: "ONGOING" } }),
    prisma.payment.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
    prisma.invoice.count({ where: { status: "PENDING" } }),
  ]);

  const enrolledThisSemester = activeSemester
    ? await prisma.courseRegistration.count({
        where: {
          status: "ENROLLED",
          section: { semesterId: activeSemester.id },
        },
      })
    : 0;

  const stats = {
    totalStudents,
    totalInstructors,
    totalCourses,
    totalPrograms,
    activeSemester: activeSemester?.name ?? null,
    enrolledThisSemester,
    totalRevenueCollected: Number(revenue._sum.amount ?? 0),
    pendingInvoices,
  };

  try {
    const redis = await getRedis();
    await redis.set(DASHBOARD_CACHE_KEY, JSON.stringify(stats), {
      EX: DASHBOARD_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Dashboard cache write failed:", error);
  }

  return stats;
};

export const AdminService = { getDashboardStats };
