import type { Context } from 'hono';

import { getRepo } from '../../repo/index.ts';

export const errorLog = async (c: Context) => {
  const start = c.req.query('start') ?? '';
  const end = c.req.query('end') ?? '';
  const limit = Number(c.req.query('limit') ?? '200');

  if (!start || !end) {
    return c.json({ error: 'start and end query parameters are required' }, 400);
  }

  const repo = getRepo();
  const entries = await repo.errorLog.query({ start, end, limit: Math.min(limit, 1000) });
  return c.json(entries);
};
