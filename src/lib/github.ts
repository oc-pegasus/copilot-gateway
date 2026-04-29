import { getRepo } from "../repo/index.ts";
import { isCoolingDown } from "./account-cooldown.ts";

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  id: number;
}

interface GithubCredentials {
  token: string;
  accountType: string;
}

export interface CredentialResult {
  token: string;
  accountType: string;
  accountId: number;
}

export function listGithubAccounts() {
  return getRepo().github.listAccounts();
}

export async function addGithubAccount(
  token: string,
  user: GitHubUser,
  accountType: string,
): Promise<void> {
  const repo = getRepo().github;
  await repo.saveAccount(user.id, { token, accountType, user });
  await repo.setActiveId(user.id);
}

export async function removeGithubAccount(userId: number): Promise<void> {
  const repo = getRepo().github;
  await repo.deleteAccount(userId);
  await getRepo().apiKeys.clearGithubAccountId(userId);
  const activeId = await repo.getActiveId();
  if (activeId === userId) {
    await repo.clearActiveId();
  }
}

export async function setActiveGithubAccount(
  userId: number,
): Promise<boolean> {
  const repo = getRepo().github;
  const account = await repo.getAccount(userId);
  if (!account) return false;
  await repo.setActiveId(userId);
  return true;
}

export async function getActiveGithubAccount() {
  const repo = getRepo().github;
  const activeId = await repo.getActiveId();
  if (activeId == null) return null;
  return repo.getAccount(activeId);
}

export async function getGithubCredentials(githubAccountId?: number): Promise<GithubCredentials> {
  if (githubAccountId != null) {
    const repo = getRepo().github;
    const account = await repo.getAccount(githubAccountId);
    if (account) {
      return { token: account.token, accountType: account.accountType };
    }
    // Fallback to active account if specified account not found
  }
  const account = await getActiveGithubAccount();
  if (!account) throw new Error("No GitHub account connected — add one via the dashboard");
  return { token: account.token, accountType: account.accountType };
}

export async function getGithubCredentialsWithFallback(
  preferredAccountId?: number,
): Promise<CredentialResult> {
  const accounts = await listGithubAccounts();
  if (accounts.length === 0) {
    throw new Error("No GitHub account connected — add one via the dashboard");
  }

  const preferredId = preferredAccountId ?? (await getRepo().github.getActiveId());

  if (preferredId != null) {
    const preferred = accounts.find((a) => a.user.id === preferredId);
    if (preferred && !isCoolingDown(preferredId)) {
      return { token: preferred.token, accountType: preferred.accountType, accountId: preferredId };
    }
  }

  for (const account of accounts) {
    if (!isCoolingDown(account.user.id)) {
      return { token: account.token, accountType: account.accountType, accountId: account.user.id };
    }
  }

  // All accounts in cooldown — use preferred anyway
  const fallback = preferredId != null
    ? accounts.find((a) => a.user.id === preferredId) ?? accounts[0]
    : accounts[0];
  return { token: fallback.token, accountType: fallback.accountType, accountId: fallback.user.id };
}
