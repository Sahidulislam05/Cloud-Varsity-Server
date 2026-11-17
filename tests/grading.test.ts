import { describe, expect, it } from "vitest";
import {
  EXAM_TYPE_WEIGHTS,
  calculateGrade,
  calculateWeightedPercentage,
} from "../src/app/utils/grading";

describe("calculateWeightedPercentage", () => {
  it("returns 100 when all exam components are present with full marks", () => {
    const results = (
      Object.keys(EXAM_TYPE_WEIGHTS) as (keyof typeof EXAM_TYPE_WEIGHTS)[]
    ).map((examType) => ({
      obtainedMarks: 40,
      totalMarks: 40,
      examType,
    }));

    expect(calculateWeightedPercentage(results)).toBeCloseTo(100, 5);
  });

  it("counts missing exam types as 0 against the FULL total weight (no inflation)", () => {
    // Only the 10%-weight QUIZ submitted with full marks.
    // Under the old "sum of present weights" logic this would grade 100 (A+).
    // Now the denominator stays at the full configured weight: 100 * 0.1 = 10.
    const percentage = calculateWeightedPercentage([
      { obtainedMarks: 40, totalMarks: 40, examType: "QUIZ" },
    ]);

    expect(percentage).toBeCloseTo(10, 5);
  });

  it("grades a partial submission strictly lower than a full one", () => {
    const partial = calculateWeightedPercentage([
      { obtainedMarks: 40, totalMarks: 40, examType: "QUIZ" },
      { obtainedMarks: 40, totalMarks: 40, examType: "ASSIGNMENT" },
    ]);
    const full = calculateWeightedPercentage([
      { obtainedMarks: 40, totalMarks: 40, examType: "QUIZ" },
      { obtainedMarks: 40, totalMarks: 40, examType: "ASSIGNMENT" },
      { obtainedMarks: 40, totalMarks: 40, examType: "MIDTERM" },
      { obtainedMarks: 40, totalMarks: 40, examType: "FINAL" },
    ]);

    expect(partial).toBeLessThan(full);
  });

  it("averages several exams of the same type so the type weight counts once", () => {
    // Three perfect quizzes must still contribute only the 10% QUIZ weight.
    const percentage = calculateWeightedPercentage([
      { obtainedMarks: 10, totalMarks: 10, examType: "QUIZ" },
      { obtainedMarks: 10, totalMarks: 10, examType: "QUIZ" },
      { obtainedMarks: 10, totalMarks: 10, examType: "QUIZ" },
    ]);

    expect(percentage).toBeCloseTo(10, 5);
  });

  it("never exceeds 100 with multiple exams per type", () => {
    const percentage = calculateWeightedPercentage([
      { obtainedMarks: 20, totalMarks: 20, examType: "QUIZ" },
      { obtainedMarks: 20, totalMarks: 20, examType: "QUIZ" },
      { obtainedMarks: 30, totalMarks: 30, examType: "ASSIGNMENT" },
      { obtainedMarks: 50, totalMarks: 50, examType: "MIDTERM" },
      { obtainedMarks: 50, totalMarks: 50, examType: "MIDTERM" },
      { obtainedMarks: 100, totalMarks: 100, examType: "FINAL" },
    ]);

    expect(percentage).toBeCloseTo(100, 5);
  });

  it("counts a missed exam (0 marks) inside its type average", () => {
    // Quiz average is (100 + 0) / 2 = 50%, weighted 0.1 → 5.
    const percentage = calculateWeightedPercentage([
      { obtainedMarks: 10, totalMarks: 10, examType: "QUIZ" },
      { obtainedMarks: 0, totalMarks: 10, examType: "QUIZ" },
    ]);

    expect(percentage).toBeCloseTo(5, 5);
  });

  it("returns 0 for an empty result list", () => {
    expect(calculateWeightedPercentage([])).toBe(0);
  });
});

describe("calculateGrade", () => {
  it("maps boundary percentages to the expected letters", () => {
    expect(calculateGrade(80)).toEqual({ gradeLetter: "A+", gradePoint: 4.0 });
    expect(calculateGrade(39.9)).toEqual({ gradeLetter: "F", gradePoint: 0.0 });
  });
});
