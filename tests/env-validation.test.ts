import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Env validation must fail fast: importing the config with required vars
 * blanked should exit(1) and print a single clear message.
 */
describe("env validation (fail-fast)", () => {
  it("exits with a clear message when required env vars are missing", () => {
    const repoRoot = path.resolve(__dirname, "..");

    let output = "";
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
          "-e",
          "import('./src/app/config/index.ts')",
        ],
        {
          cwd: repoRoot,
          stdio: "pipe",
          encoding: "utf8",
          // Blank required vars. dotenv never overwrites existing (even
          // empty) process.env values, so the child sees empty strings.
          env: {
            ...process.env,
            DATABASE_URL: "",
            JWT_ACCESS_SECRET: "",
            SMTP_USER: "",
          },
        },
      );
    } catch (error) {
      const err = error as { status?: number; stderr?: string };
      exitCode = err.status ?? 1;
      output = `${err.stderr ?? ""}`;
    }

    expect(exitCode).toBe(1);
    expect(output).toContain("Invalid environment variables");
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain("JWT_ACCESS_SECRET");
  });
});
