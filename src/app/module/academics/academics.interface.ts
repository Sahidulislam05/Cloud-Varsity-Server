export type TCreateDepartmentPayload = {
  name: string;
  code: string;
  universityId: string;
};
export type TUpdateDepartmentPayload = Partial<
  Pick<TCreateDepartmentPayload, "name" | "code">
>;

export type TCreateProgramPayload = {
  name: string;
  code: string;
  departmentId: string;
  durationSemesters: number;
};
export type TUpdateProgramPayload = Partial<
  Pick<TCreateProgramPayload, "name" | "code" | "durationSemesters">
>;

export type TCreateCoursePayload = {
  title: string;
  code: string;
  creditHours: number;
  programId: string;
  prerequisiteCourseIds?: string[];
};
export type TUpdateCoursePayload = Partial<
  Pick<TCreateCoursePayload, "title" | "code" | "creditHours">
>;

export type TCourseListQuery = {
  page?: string;
  limit?: string;
  search?: string;
  programId?: string;
  departmentId?: string;
  sortBy?: "title" | "code" | "creditHours" | "createdAt";
  sortOrder?: "asc" | "desc";
};

export type TCreateSemesterPayload = {
  name: string;
  year: number;
  startDate: string;
  endDate: string;
};

export type TCreateSectionPayload = {
  name: string;
  courseId: string;
  semesterId: string;
  instructorId: string;
  capacity: number;
};
