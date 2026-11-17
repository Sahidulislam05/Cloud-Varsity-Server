import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export const generateToken = (
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string,
) => {
  // A unique jti per token lets us denylist individual tokens (and, with
  // bl:user:<id>, every token of a user) in Redis.
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    secret as Secret,
    { expiresIn, algorithm: "HS256" } as SignOptions,
  );
};

export const verifyToken = <T>(token: string, secret: string): T => {
  return jwt.verify(token, secret as Secret, {
    algorithms: ["HS256"],
  }) as T;
};
