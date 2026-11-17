-- AlterTable
ALTER TABLE "course_registrations" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "finalGradeLetter" TEXT,
ADD COLUMN     "finalGradePoint" DOUBLE PRECISION;
