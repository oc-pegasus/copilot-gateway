// GET /api/error-log — query error log entries (admin only)

import type { Context } from "hono";
import { getRepo } from "../../repo/index.ts";

export const errorLog = async (c: Context) => {
  const start = c.req.query("start") ?? "";
  const end = c.req.query("end") ?? "";
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  if (!start || !end) {
    return c.json({
      error: "start and end query parameters are required (ISO 8601 datetime)",
    }, 400);
  }

  const entries = await getRepo().errorLog.query({ start, end, limit });
  return c.json(entries);
};
