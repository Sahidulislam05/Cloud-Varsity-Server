import { z } from "zod";

const singleLine = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, { error: `${label} must be at least ${min} characters` })
    .max(max, { error: `${label} must be at most ${max} characters` })
    .regex(/^[^\r\n]*$/, { error: `${label} must be a single line` });

export const contactValidationSchema = z.object({
  name: singleLine(2, 100, "Name"),
  email: z.email({ error: "Invalid email address" }),
  subject: singleLine(3, 120, "Subject"),
  message: z
    .string()
    .trim()
    .min(10, { error: "Message must be at least 10 characters" })
    .max(2000, { error: "Message must be at most 2000 characters" }),
});
