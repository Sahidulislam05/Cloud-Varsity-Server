import fs from "node:fs";
import path from "node:path";

/**
 * Resolve a template file across environments:
 * - production: tsup copies src/app/templates to dist/templates (publicDir)
 * - development: templates are read straight from src/
 *
 * Returns the first path that exists, falling back to the dist candidate so
 * renderFile produces a clear ENOENT error when the template is missing.
 */
export const resolveTemplatePath = (templateName: string): string => {
  const fileName = `${templateName}.ejs`;
  const candidates = [
    path.join(process.cwd(), "dist", "templates", fileName),
    path.join(process.cwd(), "src", "app", "templates", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
};
