import type { ExamType } from "../../generated/prisma/enums";

export const EXAM_TYPE_WEIGHTS: Record<ExamType, number> = {
  QUIZ: 0.1,
  ASSIGNMENT: 0.1,
  MIDTERM: 0.3,
  FINAL: 0.5,
};

export const calculateGrade = (
  percentage: number,
): { gradeLetter: string; gradePoint: number } => {
  if (percentage >= 80) return { gradeLetter: "A+", gradePoint: 4.0 };
  if (percentage >= 75) return { gradeLetter: "A", gradePoint: 3.75 };
  if (percentage >= 70) return { gradeLetter: "A-", gradePoint: 3.5 };
  if (percentage >= 65) return { gradeLetter: "B+", gradePoint: 3.25 };
  if (percentage >= 60) return { gradeLetter: "B", gradePoint: 3.0 };
  if (percentage >= 55) return { gradeLetter: "B-", gradePoint: 2.75 };
  if (percentage >= 50) return { gradeLetter: "C+", gradePoint: 2.5 };
  if (percentage >= 45) return { gradeLetter: "C", gradePoint: 2.25 };
  if (percentage >= 40) return { gradeLetter: "D", gradePoint: 2.0 };
  return { gradeLetter: "F", gradePoint: 0.0 };
};

/**
 * Weighted percentage for one student in one section.
 *
 * Pass one entry per exam of the section (an exam the student has no result
 * for counts as 0 obtained marks). Exams of the same type are averaged, so
 * e.g. three quizzes together still carry the QUIZ weight once. A type with
 * no exams contributes 0 while its weight still counts in the denominator,
 * so partial assessment can never inflate a grade.
 */
export const calculateWeightedPercentage = (
  results: { obtainedMarks: number; totalMarks: number; examType: ExamType }[],
) => {
  const percentagesByType = new Map<ExamType, number[]>();
  for (const result of results) {
    const percentage = (result.obtainedMarks / result.totalMarks) * 100;
    const list = percentagesByType.get(result.examType) ?? [];
    list.push(percentage);
    percentagesByType.set(result.examType, list);
  }

  let weightedSum = 0;
  for (const [examType, percentages] of percentagesByType) {
    const average =
      percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
    weightedSum += average * EXAM_TYPE_WEIGHTS[examType];
  }

  const fullTotalWeight = Object.values(EXAM_TYPE_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );

  return fullTotalWeight === 0 ? 0 : weightedSum / fullTotalWeight;
};
