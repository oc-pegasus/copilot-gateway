import type { Context } from "hono";
import { getRepo } from "../../repo/index.ts";

export const errorLog = async (c: Context) => {
  const start = c.req.query("start") || undefined;
  const end = c.req.query("end") || undefined;
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 200), 1000) : 200;

  const entries = await getRepo().errorLog.query({ start, end, limit });
  return c.json(entries);
};
