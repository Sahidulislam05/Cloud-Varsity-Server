import type { Gender, Role } from "../../../generated/prisma/enums";

export type TUpdateProfilePayload = {
  name?: string;
  phone?: string;
  gender?: Gender;
};

export type TUserListQuery = {
  page?: string;
  limit?: string;
  role?: Role;
  search?: string;
};

export type TAssignDepartmentPayload = {
  departmentId: string;
};
