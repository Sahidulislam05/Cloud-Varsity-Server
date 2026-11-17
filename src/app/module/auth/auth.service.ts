import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import httpStatus from "http-status";
import ejs from "ejs";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { getRedis } from "../../lib/redis";
import { AppError } from "../../utils/appError";
import { generateToken, verifyToken } from "../../utils/jwt";
import { resolveTemplatePath } from "../../utils/templateResolver";
import type {
  TForgotPasswordPayload,
  TDemoLoginPayload,
  TGoogleLoginPayload,
  TJwtPayload,
  TLoginPayload,
  TRegisterPayload,
  TResetPasswordPayload,
} from "./auth.interface";
import { sendTemplatedEmail } from "../../utils/sendTemplatedEmail";

const googleClient = new OAuth2Client(config.google_client_id);

// ---- OTP configuration -----------------------------------------------------
const OTP_TTL_SECONDS = 5 * 60;
const MAX_OTP_ATTEMPTS = 5;

const otpKey = (email: string) => `otp:reset-password:${email}`;
const otpAttemptsKey = (email: string) => `otp:attempts:${email}`;

// ---- Refresh-token revocation ---------------------------------------------
const REDIS_UNAVAILABLE_MESSAGE =
  "Password reset is temporarily unavailable, please try again later";

const REFRESH_TTL_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** Remaining lifetime of a freshly issued refresh token, in seconds. */
const refreshTtlSeconds = () => {
  const match = /^\s*(\d+)([smhd])\s*$/.exec(config.jwt_refresh_expires_in);
  if (!match) return 7 * 24 * 60 * 60;
  return Number(match[1]) * REFRESH_TTL_UNITS[match[2]];
};

/** Denylist a single refresh token's jti for the remainder of its lifetime. */
const denylistJti = async (jti: string, ttlSeconds: number) => {
  if (ttlSeconds <= 0) return;
  const redis = await getRedis();
  await redis.set(`bl:jti:${jti}`, "1", { EX: ttlSeconds });
};

/**
 * Blanket denylist for a user's refresh tokens. Checked on every refresh —
 * a password reset (or any future admin lock) kills all live sessions.
 */
const denylistUser = async (userId: string) => {
  const redis = await getRedis();
  await redis.set(`bl:user:${userId}`, "1", { EX: refreshTtlSeconds() });
};

const generateAuthTokens = (payload: TJwtPayload) => {
  const accessToken = generateToken(
    payload,
    config.jwt_access_secret,
    config.jwt_access_expires_in,
  );
  const refreshToken = generateToken(
    payload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in,
  );
  return { accessToken, refreshToken };
};

const registerUser = async (payload: TRegisterPayload) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (existingUser) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This email is already registered",
    );
  }

  const program = await prisma.program.findUnique({
    where: { id: payload.programId },
  });
  if (!program) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid program selected");
  }

  const hashedPassword = await bcrypt.hash(
    payload.password,
    Number(config.bcrypt_salt_rounds),
  );
  const studentId = `STU${Date.now()}`;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        password: hashedPassword,
        phone: payload.phone,
        role: "STUDENT",
      },
    });

    await tx.studentProfile.create({
      data: {
        userId: user.id,
        studentId,
        programId: payload.programId,
        batch: payload.batch,
      },
    });

    return user;
  });

  const jwtPayload: TJwtPayload = {
    userId: result.id,
    name: result.name,
    email: result.email,
    role: result.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(jwtPayload);

  await sendTemplatedEmail(
    result.email,
    "Welcome to CloudVarsity!",
    "welcome-email",
    {
      name: result.name,
      studentId,
      email: result.email,
    },
  );
  return { accessToken, refreshToken, user: jwtPayload };
};

const loginUser = async (payload: TLoginPayload) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (!user || !user.password) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  if (user.deletedAt) {
    throw new AppError(httpStatus.FORBIDDEN, "This account no longer exists");
  }

  if (!user.isActive) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account has been deactivated. Contact admin.",
    );
  }

  const isPasswordCorrect = await bcrypt.compare(
    payload.password,
    user.password,
  );
  if (!isPasswordCorrect) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const jwtPayload: TJwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(jwtPayload);

  return { accessToken, refreshToken, user: jwtPayload };
};

const refreshAccessToken = async (token: string) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token not found");
  }

  let decoded: TJwtPayload;
  try {
    decoded = verifyToken<TJwtPayload>(token, config.jwt_refresh_secret);
  } catch {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Invalid or expired refresh token",
    );
  }

  // Tokens minted before jti existed cannot be tracked or revoked — reject
  // them so every client re-authenticates once against the new scheme.
  if (!decoded.jti || !decoded.exp) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Invalid or expired refresh token",
    );
  }

  // Redis is the source of truth for revocation: fail closed (503) when it
  // is unavailable, never fail open.
  let userDenylisted: string | null = null;
  let tokenDenylisted: string | null = null;
  try {
    const redis = await getRedis();
    [userDenylisted, tokenDenylisted] = await Promise.all([
      redis.get(`bl:user:${decoded.userId}`),
      redis.get(`bl:jti:${decoded.jti}`),
    ]);
  } catch (error) {
    console.error("Redis unavailable during refresh:", error);
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Session service is temporarily unavailable, please try again later",
    );
  }

  if (userDenylisted || tokenDenylisted) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Session revoked, please log in again",
    );
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || user.deletedAt || !user.isActive) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This account is no longer active",
    );
  }

  // Rotation is atomic: SET NX claims the jti exactly once, so two concurrent
  // refreshes with the same token cannot both mint a new pair — the loser is
  // rejected as revoked. The claimed key doubles as the denylist entry.
  const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
  try {
    const redis = await getRedis();
    const claimed = await redis.set(`bl:jti:${decoded.jti}`, "1", {
      EX: remainingTtl > 0 ? remainingTtl : 1,
      NX: true,
    });
    if (!claimed) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "Session revoked, please log in again",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Redis unavailable during refresh rotation:", error);
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Session service is temporarily unavailable, please try again later",
    );
  }

  const jwtPayload: TJwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(jwtPayload);

  return { accessToken, refreshToken, user: jwtPayload };
};

const logoutUser = async (token?: string) => {
  if (!token) return;

  try {
    const decoded = verifyToken<TJwtPayload>(token, config.jwt_refresh_secret);
    if (decoded.jti && decoded.exp) {
      const remainingTtl = decoded.exp - Math.floor(Date.now() / 1000);
      await denylistJti(decoded.jti, remainingTtl);
    }
  } catch (error) {
    // An invalid/expired token has nothing to revoke, and Redis being down
    // must not block the user from logging out — the cookies are cleared
    // regardless. Log so the failed revocation is still visible.
    console.warn("Logout could not revoke the refresh token:", error);
  }
};

const googleLogin = async (payload: TGoogleLoginPayload) => {
  const ticket = await googleClient.verifyIdToken({
    idToken: payload.idToken,
    audience: config.google_client_id,
  });

  const googlePayload = ticket.getPayload();
  if (!googlePayload?.email) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Could not verify Google account",
    );
  }

  if (!googlePayload.email_verified) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Your Google email address is not verified",
    );
  }

  // Google sign-in only links to an existing account: a new student needs a
  // program and batch, which only the registration form collects.
  const user = await prisma.user.findUnique({
    where: { email: googlePayload.email },
  });
  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No account is registered with this Google email. Please register first.",
    );
  }

  if (user.deletedAt || !user.isActive) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This account is no longer active",
    );
  }

  const jwtPayload: TJwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(jwtPayload);

  return { accessToken, refreshToken, user: jwtPayload };
};

/** Seeded demo account per role; emails come from the seed env vars. */
const DEMO_ACCOUNT_EMAILS: Record<TDemoLoginPayload["role"], string> = {
  STUDENT: config.student_email,
  INSTRUCTOR: config.instructor_admin_email,
  DEPARTMENT_ADMIN: config.department_admin_email,
  REGISTRAR: config.registrar_email,
  FINANCE_ADMIN: config.finance_admin_email,
  SUPER_ADMIN: config.super_admin_email,
};

/**
 * Password-less sign-in as a seeded demo account. Disabled (404) unless the
 * server's DEMO_MODE is on, so no credential ever has to reach the browser.
 */
const demoLogin = async (payload: TDemoLoginPayload) => {
  if (!config.demo_mode) {
    throw new AppError(httpStatus.NOT_FOUND, "Route not found");
  }

  const user = await prisma.user.findUnique({
    where: { email: DEMO_ACCOUNT_EMAILS[payload.role] },
  });
  if (!user || user.role !== payload.role || user.deletedAt || !user.isActive) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "The demo account for this role is not available",
    );
  }

  const jwtPayload: TJwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const { accessToken, refreshToken } = generateAuthTokens(jwtPayload);

  return { accessToken, refreshToken, user: jwtPayload };
};

const forgotPassword = async (payload: TForgotPasswordPayload) => {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (!user) return;

  // Redis is required for the reset flow — fail cleanly (503) instead of an
  // unhandled crash when it is unavailable.
  let otp: string;
  try {
    otp = crypto.randomInt(100000, 1000000).toString();
    // Store the OTP hashed; a Redis dump or read must not reveal usable OTPs.
    const hashedOtp = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");
    const redis = await getRedis();
    await redis.set(otpKey(payload.email), hashedOtp, {
      EX: OTP_TTL_SECONDS,
    });
    // A fresh OTP resets any stale attempt counter for this email.
    await redis.del(otpAttemptsKey(payload.email));
  } catch (error) {
    console.error("Redis unavailable during forgot-password:", error);
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, REDIS_UNAVAILABLE_MESSAGE);
  }

  const expirationMinutes = OTP_TTL_SECONDS / 60;

  try {
    const html = await ejs.renderFile(
      resolveTemplatePath("forgot-password"),
      { name: user.name, otp, expirationMinutes },
    );

    await transporter.sendMail({
      from: config.email_sender,
      to: user.email,
      subject: "Reset your CloudVarsity password",
      html,
    });
  } catch (error) {
    // A broken template or SMTP failure must be loud: the user otherwise
    // waits forever for an OTP that will never arrive.
    console.error("Failed to send forgot-password email:", error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to send the password reset email, please try again later",
    );
  }
};

const resetPassword = async (payload: TResetPasswordPayload) => {
  let storedHash: string | null;
  try {
    const redis = await getRedis();
    storedHash = await redis.get(otpKey(payload.email));
  } catch (error) {
    console.error("Redis unavailable during reset-password:", error);
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, REDIS_UNAVAILABLE_MESSAGE);
  }

  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (!user) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  // The OTP is stored hashed; compare sha256 digests, not raw strings, so
  // the check is also timing-safe.
  const providedHash = crypto
    .createHash("sha256")
    .update(payload.otp)
    .digest("hex");

  const isOtpValid =
    storedHash !== null &&
    storedHash.length === providedHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(storedHash, "hex"),
      Buffer.from(providedHash, "hex"),
    );

  if (!isOtpValid) {
    try {
      const redis = await getRedis();
      const attempts = await redis.get(otpAttemptsKey(payload.email));
      if (attempts && Number(attempts) >= MAX_OTP_ATTEMPTS) {
        // Brute-force guard: the OTP dies, the user must request a new one.
        await redis.del(otpKey(payload.email));
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Too many invalid attempts. Please request a new OTP.",
        );
      }

      // Counter TTL mirrors the remaining OTP lifetime; after the OTP
      // expires both keys disappear together.
      const ttl = await redis.ttl(otpKey(payload.email));
      await redis.set(
        otpAttemptsKey(payload.email),
        String((attempts ? Number(attempts) : 0) + 1),
        { EX: ttl > 0 ? ttl : OTP_TTL_SECONDS },
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error("Redis unavailable during reset-password:", error);
      throw new AppError(httpStatus.SERVICE_UNAVAILABLE, REDIS_UNAVAILABLE_MESSAGE);
    }

    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  const hashedPassword = await bcrypt.hash(
    payload.newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  try {
    // Success: the OTP and its counter are spent...
    const redis = await getRedis();
    await redis.del(otpKey(payload.email));
    await redis.del(otpAttemptsKey(payload.email));
    // ...and every refresh token the user may still hold must die.
    await denylistUser(user.id);
  } catch (error) {
    console.error("Redis unavailable during reset-password cleanup:", error);
    throw new AppError(httpStatus.SERVICE_UNAVAILABLE, REDIS_UNAVAILABLE_MESSAGE);
  }

  // Notification only — the password change itself must not fail with it.
  await sendTemplatedEmail(
    user.email,
    "Your CloudVarsity password was reset",
    "reset-password-success",
    { name: user.name },
  );
};

export const AuthService = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  googleLogin,
  demoLogin,
  forgotPassword,
  resetPassword,
};
