import { createClient } from "redis";
import config from "../config";

const redisClient = createClient({
  username: config.redis_user,
  password: config.redis_password,
  socket: {
    host: config.redis_host,
    port: Number(config.redis_port),
    // Give up after 10 failed reconnects (~27s of backoff); the next
    // getRedis() call opens a fresh connection.
    reconnectStrategy: (retries) =>
      retries > 10 ? false : Math.min(retries * 100, 5000),
  },
});

// 'error' events are emitted on every failed reconnect attempt; log them so
// the process never crashes on Redis transport errors.
redisClient.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

let connecting: Promise<unknown> | null = null;

/**
 * Returns a connected Redis client, connecting on first use. This works the
 * same way on a long-running server and on a serverless runtime (Vercel),
 * where no startup hook runs. Concurrent callers share one connect attempt.
 * Throws when Redis is not configured or unreachable; callers decide how to
 * degrade.
 */
export const getRedis = async () => {
  if (!config.redis_host || !config.redis_port) {
    throw new Error("Redis is not configured");
  }
  if (!redisClient.isOpen) {
    connecting ??= redisClient.connect().finally(() => {
      connecting = null;
    });
    await connecting;
  }
  return redisClient;
};
