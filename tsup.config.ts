import fs from "node:fs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm", "cjs"],
  target: "esnext",
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  // Copy EJS templates to dist/templates so they resolve at runtime in prod.
  onSuccess: async () => {
    await fs.promises.cp("src/app/templates", "dist/templates", {
      recursive: true,
    });
    console.log("Copied src/app/templates -> dist/templates");
  },
  // Add banner to shim require() for CJS dependencies in ESM context
  banner: {
    js: `
      import { createRequire } from 'module';
      const require = createRequire(import.meta.url);
    `,
  },
});
