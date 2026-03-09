// GET /api/token-usage — query per-key token usage records

import type { Context } from "hono";
import { queryUsage } from "../lib/usage-tracker.ts";

export const tokenUsage = async (c: Context) => {
  const keyId = c.req.query("key_id") || undefined;
  const start = c.req.query("start") ?? "";
  const end = c.req.query("end") ?? "";

  if (!start || !end) {
    return c.json({ error: "start and end query parameters are required (e.g. 2026-03-09T00)" }, 400);
  }

  const records = await queryUsage({ keyId, start, end });
  return c.json(records);
};
