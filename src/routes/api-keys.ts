// API key management routes

import type { Context } from "hono";
import { createApiKey, listApiKeys, getApiKeyById, deleteApiKey, rotateApiKey, renameApiKey, type ApiKey } from "../lib/api-keys.ts";
import { getRepo } from "../repo/mod.ts";

function keyToJson(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    key: k.key,
    created_at: k.createdAt,
    last_used_at: k.lastUsedAt ?? null,
    github_account_id: k.githubAccountId ?? null,
  };
}

export const listKeys = async (c: Context) => {
  const isAdmin = c.get("isAdmin");
  if (isAdmin) {
    const keys = await listApiKeys();
    return c.json(keys.map((k) => keyToJson(k)));
  }
  // Non-admin: return only the caller's own key
  const keyId = c.get("apiKeyId") as string;
  const key = await getApiKeyById(keyId);
  return c.json(key ? [keyToJson(key)] : []);
};

export const createKey = async (c: Context) => {
  const body = await c.req.json<{ name?: string; github_account_id?: number }>();
  if (!body.name || typeof body.name !== "string") {
    return c.json({ error: "name is required" }, 400);
  }

  const githubAccountId = typeof body.github_account_id === "number" ? body.github_account_id : undefined;
  const key = await createApiKey(body.name, githubAccountId);
  return c.json(keyToJson(key), 201);
};

export const deleteKey = async (c: Context) => {
  const id = c.req.param("id") ?? "";
  const deleted = await deleteApiKey(id);
  if (!deleted) return c.json({ error: "Key not found" }, 404);
  return c.json({ ok: true });
};

export const rotateKey = async (c: Context) => {
  const id = c.req.param("id") ?? "";
  const key = await rotateApiKey(id);
  if (!key) return c.json({ error: "Key not found" }, 404);
  return c.json(keyToJson(key));
};

export const updateKey = async (c: Context) => {
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<{ name?: string; github_account_id?: number | null }>();

  const hasName = typeof body.name === "string" && body.name.length > 0;
  const hasGithubAccountId = "github_account_id" in body;

  if (!hasName && !hasGithubAccountId) {
    return c.json({ error: "name or github_account_id is required" }, 400);
  }

  if (hasName) {
    const renamed = await renameApiKey(id, body.name!);
    if (!renamed) return c.json({ error: "Key not found" }, 404);
  }

  if (hasGithubAccountId) {
    const githubAccountId = typeof body.github_account_id === "number" ? body.github_account_id : null;
    const updated = await getRepo().apiKeys.updateGithubAccountId(id, githubAccountId);
    if (!updated) return c.json({ error: "Key not found" }, 404);
  }

  const key = await getApiKeyById(id);
  if (!key) return c.json({ error: "Key not found" }, 404);
  return c.json(keyToJson(key));
};
