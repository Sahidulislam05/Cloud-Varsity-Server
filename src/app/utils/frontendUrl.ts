import config from "../config";

/**
 * Absolute URL on the primary frontend. FRONTEND_URL may list several
 * comma-separated origins (for CORS); the first one is the canonical site.
 */
export const frontendUrl = (path: string) => {
  const base = config.frontend_url.split(",")[0].trim().replace(/\/$/, "");
  return new URL(`${base}${path}`);
};
