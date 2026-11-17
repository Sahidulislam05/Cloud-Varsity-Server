import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env") });

/**
 * All required env vars are validated at import time so the process fails fast
 * with one clear message instead of crashing later with cryptic runtime errors.
 *
 * Optional groups (redis, cloudinary, google client id) are allowed to be empty
 * and only produce a warning — the app must be able to boot without Redis.
 */
const requiredString = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .min(1, { error: `${label} is required` });

const envSchema = z.object({
  NODE_ENV: requiredString("NODE_ENV").refine(
    (value) => ["development", "production", "test"].includes(value),
    { error: "NODE_ENV must be development, production or test" },
  ),
  PORT: requiredString("PORT").refine(
    (value) => Number.isInteger(Number(value)) && Number(value) > 0,
    { error: "PORT must be a valid port number" },
  ),
  DATABASE_URL: requiredString("DATABASE_URL"),
  JWT_ACCESS_SECRET: requiredString("JWT_ACCESS_SECRET").refine(
    (value) => value.length >= 32,
    { error: "JWT_ACCESS_SECRET must be at least 32 characters" },
  ),
  JWT_REFRESH_SECRET: requiredString("JWT_REFRESH_SECRET").refine(
    (value) => value.length >= 32,
    { error: "JWT_REFRESH_SECRET must be at least 32 characters" },
  ),
  JWT_ACCESS_EXPIRES_IN: requiredString("JWT_ACCESS_EXPIRES_IN"),
  JWT_REFRESH_EXPIRES_IN: requiredString("JWT_REFRESH_EXPIRES_IN"),
  BCRYPT_SALT_ROUNDS: requiredString("BCRYPT_SALT_ROUNDS").refine(
    (value) => Number.isInteger(Number(value)) && Number(value) >= 4,
    { error: "BCRYPT_SALT_ROUNDS must be an integer >= 4" },
  ),
  FRONTEND_URL: requiredString("FRONTEND_URL"),
  BACKEND_URL: requiredString("BACKEND_URL"),
  SMTP_USER: requiredString("SMTP_USER"),
  SMTP_PASSWORD: requiredString("SMTP_PASSWORD"),
  EMAIL_SENDER: requiredString("EMAIL_SENDER"),

  // Seed credentials (all required).
  SUPER_ADMIN_NAME: requiredString("SUPER_ADMIN_NAME"),
  SUPER_ADMIN_EMAIL: requiredString("SUPER_ADMIN_EMAIL"),
  SUPER_ADMIN_PASSWORD: requiredString("SUPER_ADMIN_PASSWORD"),
  INSTRUCTOR_ADMIN_NAME: requiredString("INSTRUCTOR_ADMIN_NAME"),
  INSTRUCTOR_ADMIN_EMAIL: requiredString("INSTRUCTOR_ADMIN_EMAIL"),
  INSTRUCTOR_ADMIN_PASSWORD: requiredString("INSTRUCTOR_ADMIN_PASSWORD"),
  DEPARTMENT_ADMIN_NAME: requiredString("DEPARTMENT_ADMIN_NAME"),
  DEPARTMENT_ADMIN_EMAIL: requiredString("DEPARTMENT_ADMIN_EMAIL"),
  DEPARTMENT_ADMIN_PASSWORD: requiredString("DEPARTMENT_ADMIN_PASSWORD"),
  REGISTRAR_NAME: requiredString("REGISTRAR_NAME"),
  REGISTRAR_EMAIL: requiredString("REGISTRAR_EMAIL"),
  REGISTRAR_PASSWORD: requiredString("REGISTRAR_PASSWORD"),
  FINANCE_ADMIN_NAME: requiredString("FINANCE_ADMIN_NAME"),
  FINANCE_ADMIN_EMAIL: requiredString("FINANCE_ADMIN_EMAIL"),
  FINANCE_ADMIN_PASSWORD: requiredString("FINANCE_ADMIN_PASSWORD"),
  STUDENT_NAME: requiredString("STUDENT_NAME"),
  STUDENT_EMAIL: requiredString("STUDENT_EMAIL"),
  STUDENT_PASSWORD: requiredString("STUDENT_PASSWORD"),

  SSL_COMMERZ_STORE_ID: requiredString("SSL_COMMERZ_STORE_ID"),
  SSL_COMMERZ_STORE_PASSWORD: requiredString("SSL_COMMERZ_STORE_PASSWORD"),
  SSL_COMMERZ_IS_LIVE: z.enum(["true", "false"], {
    error: 'SSL_COMMERZ_IS_LIVE must be "true" or "false"',
  }),

  // Enables POST /auth/demo-login, which signs in as the seeded demo
  // accounts without a password. Off unless explicitly "true".
  DEMO_MODE: z.enum(["true", "false"]).optional().default("false"),

  // Optional: warn-only, empty values allowed.
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  REDIS_USER: z.string().optional().default(""),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_HOST: z.string().optional().default(""),
  REDIS_PORT: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(
    `Invalid environment variables — fix them and restart the server:\n${issues}`,
  );
  process.exit(1);
}

// Warn-only optional groups: the app boots without them but features degrade.
const optionalWarnings: string[] = [];
if (!parsed.data.REDIS_HOST || !parsed.data.REDIS_PORT) {
  optionalWarnings.push(
    "REDIS_* is not fully configured — password reset, refresh-token revocation and dashboard cache will be unavailable",
  );
}
if (!parsed.data.GOOGLE_CLIENT_ID) {
  optionalWarnings.push("GOOGLE_CLIENT_ID is not configured — Google login will fail");
}
for (const warning of optionalWarnings) {
  console.warn(`Warning: ${warning}`);
}

export default {
  node_env: parsed.data.NODE_ENV,
  port: Number(parsed.data.PORT),
  database_url: parsed.data.DATABASE_URL,
  backend_url: parsed.data.BACKEND_URL,
  frontend_url: parsed.data.FRONTEND_URL,
  bcrypt_salt_rounds: parsed.data.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: parsed.data.JWT_ACCESS_SECRET,
  jwt_refresh_secret: parsed.data.JWT_REFRESH_SECRET,
  jwt_access_expires_in: parsed.data.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_expires_in: parsed.data.JWT_REFRESH_EXPIRES_IN,
  google_client_id: parsed.data.GOOGLE_CLIENT_ID,
  super_admin_name: parsed.data.SUPER_ADMIN_NAME,
  super_admin_email: parsed.data.SUPER_ADMIN_EMAIL,
  super_admin_password: parsed.data.SUPER_ADMIN_PASSWORD,
  instructor_admin_name: parsed.data.INSTRUCTOR_ADMIN_NAME,
  instructor_admin_email: parsed.data.INSTRUCTOR_ADMIN_EMAIL,
  instructor_admin_password: parsed.data.INSTRUCTOR_ADMIN_PASSWORD,
  department_admin_name: parsed.data.DEPARTMENT_ADMIN_NAME,
  department_admin_email: parsed.data.DEPARTMENT_ADMIN_EMAIL,
  department_admin_password: parsed.data.DEPARTMENT_ADMIN_PASSWORD,
  registrar_name: parsed.data.REGISTRAR_NAME,
  registrar_email: parsed.data.REGISTRAR_EMAIL,
  registrar_password: parsed.data.REGISTRAR_PASSWORD,
  finance_admin_name: parsed.data.FINANCE_ADMIN_NAME,
  finance_admin_email: parsed.data.FINANCE_ADMIN_EMAIL,
  finance_admin_password: parsed.data.FINANCE_ADMIN_PASSWORD,
  student_name: parsed.data.STUDENT_NAME,
  student_email: parsed.data.STUDENT_EMAIL,
  student_password: parsed.data.STUDENT_PASSWORD,
  redis_user: parsed.data.REDIS_USER,
  redis_password: parsed.data.REDIS_PASSWORD,
  redis_host: parsed.data.REDIS_HOST,
  redis_port: parsed.data.REDIS_PORT,
  smtp_user: parsed.data.SMTP_USER,
  smtp_password: parsed.data.SMTP_PASSWORD,
  email_sender: parsed.data.EMAIL_SENDER,
  ssl_commerz_store_id: parsed.data.SSL_COMMERZ_STORE_ID,
  ssl_commerz_store_passwd: parsed.data.SSL_COMMERZ_STORE_PASSWORD,
  ssl_commerz_is_live: parsed.data.SSL_COMMERZ_IS_LIVE === "true",
  demo_mode: parsed.data.DEMO_MODE === "true",
};
