// Per-key token usage tracking via Deno KV with atomic sum

import { kv } from "./kv.ts";

function currentHour(): string {
  return new Date().toISOString().slice(0, 13); // "2026-03-09T15"
}

export async function recordUsage(
  keyId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const hour = currentHour();
  await kv.atomic()
    .sum(["usage", keyId, model, hour, "r"], BigInt(1))
    .sum(["usage", keyId, model, hour, "i"], BigInt(inputTokens))
    .sum(["usage", keyId, model, hour, "o"], BigInt(outputTokens))
    .commit();
}

export interface UsageRecord {
  keyId: string;
  model: string;
  hour: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export async function queryUsage(opts: {
  keyId?: string;
  start: string;
  end: string;
}): Promise<UsageRecord[]> {
  const prefix: Deno.KvKey = opts.keyId ? ["usage", opts.keyId] : ["usage"];
  const map = new Map<string, UsageRecord>();

  for await (const entry of kv.list<Deno.KvU64>({ prefix })) {
    // key shape: ["usage", keyId, model, hour, metric]
    const keyId = entry.key[1] as string;
    const model = entry.key[2] as string;
    const hour = entry.key[3] as string;
    const metric = entry.key[4] as string;
    if (hour < opts.start || hour >= opts.end) continue;

    const mapKey = `${keyId}\0${model}\0${hour}`;
    let rec = map.get(mapKey);
    if (!rec) {
      rec = { keyId, model, hour, requests: 0, inputTokens: 0, outputTokens: 0 };
      map.set(mapKey, rec);
    }

    const val = Number(entry.value);
    if (metric === "r") rec.requests = val;
    else if (metric === "i") rec.inputTokens = val;
    else if (metric === "o") rec.outputTokens = val;
  }

  return [...map.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}
