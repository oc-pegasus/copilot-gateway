import type { Context, Next } from "hono";
import { getEnv } from "../lib/env.ts";
import { validateApiKey } from "../lib/api-keys.ts";

const PUBLIC_PATHS = new Set(["/", "/dashboard"]);
const AUTH_VALIDATE_PATHS = new Set(["/auth/login"]);

export const authMiddleware = async (c: Context, next: Next) => {
  const path = c.req.path;

  if (PUBLIC_PATHS.has(path) && c.req.method === "GET") return next();
  if (AUTH_VALIDATE_PATHS.has(path) && c.req.method === "POST") return next();

  const key = extractKey(c);
  if (!key) return c.json({ error: "Unauthorized" }, 401);

  // Admin key (ACCESS_KEY env var) — backward compatible
  const adminKey = getEnv("ACCESS_KEY");
  if (adminKey && key === adminKey) {
    c.set("apiKeyId", "admin");
    return next();
  }

  // Multi-key lookup
  const result = await validateApiKey(key);
  if (result) {
    c.set("apiKeyId", result.id);
    return next();
  }

  return c.json({ error: "Unauthorized" }, 401);
};

function extractKey(c: Context): string | null {
  const url = new URL(c.req.url);
  return (
    url.searchParams.get("key") ??
    c.req.header("x-api-key") ??
    c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  );
}
