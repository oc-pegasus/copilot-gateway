// GitHub connection — multi-account: multiple GitHub tokens stored in KV
// One account is "active" at a time; all LLM requests use the active account's token.
//
// KV layout:
//   ["github_accounts", <user_id>] → GitHubAccount { token, user }
//   ["config", "active_github_account"] → number (user_id)

import { kv } from "./kv.ts";

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  id: number;
}

export interface GitHubAccount {
  token: string;
  user: GitHubUser;
}

// ---- Multi-account CRUD ----

/** List all connected GitHub accounts */
export async function listGithubAccounts(): Promise<GitHubAccount[]> {
  const accounts: GitHubAccount[] = [];
  for await (const entry of kv.list<GitHubAccount>({ prefix: ["github_accounts"] })) {
    if (entry.value) accounts.push(entry.value);
  }
  return accounts;
}

/** Add (or update) a GitHub account and set it as active */
export async function addGithubAccount(token: string, user: GitHubUser): Promise<void> {
  await kv.set(["github_accounts", user.id], { token, user } satisfies GitHubAccount);
  await kv.set(["config", "active_github_account"], user.id);
}

/** Remove a GitHub account. If it was active, clear the active pointer. */
export async function removeGithubAccount(userId: number): Promise<void> {
  await kv.delete(["github_accounts", userId]);
  const active = await kv.get<number>(["config", "active_github_account"]);
  if (active.value === userId) {
    await kv.delete(["config", "active_github_account"]);
  }
}

/** Set the active GitHub account */
export async function setActiveGithubAccount(userId: number): Promise<boolean> {
  const account = await kv.get<GitHubAccount>(["github_accounts", userId]);
  if (!account.value) return false;
  await kv.set(["config", "active_github_account"], userId);
  return true;
}

/** Get the active GitHub account (user + token) */
export async function getActiveGithubAccount(): Promise<GitHubAccount | null> {
  const activeId = await kv.get<number>(["config", "active_github_account"]);
  if (activeId.value == null) return null;
  const account = await kv.get<GitHubAccount>(["github_accounts", activeId.value]);
  return account.value;
}

// ---- Compatibility layer for existing route code ----

/** Get the active GitHub token (used by all LLM routes) */
export async function getGithubToken(): Promise<string> {
  const account = await getActiveGithubAccount();
  if (account) return account.token;
  // Env fallback for initial setup
  // deno-lint-ignore no-explicit-any
  return (Deno as any).env.get("GITHUB_TOKEN") ?? "";
}
