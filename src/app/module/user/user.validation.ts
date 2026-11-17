import { z } from "zod";

export const updateProfileValidationSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
});

export const updateUserStatusValidationSchema = z.object({
  isActive: z.boolean({ error: "isActive must be true or false" }),
});

export const assignDepartmentValidationSchema = z.object({
  departmentId: z.string().min(1, "departmentId is required"),
});

export const createStaffUserValidationSchema = z
  .object({
    name: z.string().trim().min(2, { error: "Name must be at least 2 characters" }),
    email: z.email({ error: "Invalid email address" }),
    role: z.enum(["INSTRUCTOR", "DEPARTMENT_ADMIN", "REGISTRAR", "FINANCE_ADMIN"], {
      error: "Role must be Instructor, Department Admin, Registrar or Finance Admin",
    }),
    departmentId: z.string().min(1).optional(),
    employeeId: z.string().trim().min(1).optional(),
    designation: z.string().trim().min(2).optional(),
  })
  .superRefine((data, ctx) => {
    const needsDepartment =
      data.role === "INSTRUCTOR" || data.role === "DEPARTMENT_ADMIN";
    if (needsDepartment && !data.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Department is required for this role",
      });
    }
    if (!needsDepartment && data.departmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Only Instructors and Department Admins belong to a department",
      });
    }
    if (data.role === "INSTRUCTOR") {
      if (!data.employeeId) {
        ctx.addIssue({
          code: "custom",
          path: ["employeeId"],
          message: "Employee ID is required for an Instructor",
        });
      }
      if (!data.designation) {
        ctx.addIssue({
          code: "custom",
          path: ["designation"],
          message: "Designation is required for an Instructor",
        });
      }
    } else if (data.employeeId || data.designation) {
      ctx.addIssue({
        code: "custom",
        path: ["role"],
        message: "Employee ID and designation apply to Instructors only",
      });
    }
  });
