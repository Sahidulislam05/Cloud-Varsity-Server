import app from "./app";
import config from "./app/config";
import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { getRedis } from "./app/lib/redis";
import {
  seedDepartmentAdmin,
  seedInstructorAdmin,
  seedStudent,
  seedSuperAdmin,
  seedUniversity,
} from "./app/utils/seed";

const PORT = config.port;

// On Vercel the app is served as a serverless function from the default
// export below — never call listen (and don't pay for seeds/verifications
// on every cold start). Redis connects lazily on first use (see getRedis).
const isServerless = Boolean(process.env.VERCEL);

const main = async () => {
  try {
    await prisma.$connect();
    console.log("Connected to the database successfully.");

    try {
      await getRedis();
      console.log("Redis connected successfully.");
    } catch (redisError) {
      console.error(
        "Redis connection failed, continuing without cache:",
        redisError,
      );
    }

    try {
      await transporter.verify();
      console.log("Nodemailer connected successfully.");
    } catch (mailError) {
      console.error(
        "Nodemailer verification failed, email sending may not work:",
        mailError,
      );
    }

    await seedUniversity();
    await seedSuperAdmin();
    await seedDepartmentAdmin();
    await seedInstructorAdmin();
    await seedStudent();

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const shutdown = (signal: string) => {
      console.log(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        void prisma
          .$disconnect()
          .finally(() => process.exit(0));
      });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Error starting the server:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

if (!isServerless) {
  void main();
}

export default app;
