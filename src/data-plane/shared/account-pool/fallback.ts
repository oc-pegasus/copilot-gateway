import { getRepo } from "../../../repo/index.ts";
import type { GitHubAccount } from "../../../repo/types.ts";
import {
  isAccountSwitchableStatus,
  isCopilotTokenFetchError,
} from "../../../lib/copilot.ts";
import {
  clearModelBackoffs,
  isAccountModelBackedOff,
  markAccountModelBackoff,
} from "../../../lib/account-model-backoffs.ts";
import {
  findModelInModels,
  isSwitchableModelsLoadError,
  loadModelsForAccount,
  ModelsFetchError,
} from "../../../lib/models-cache.ts";

export interface AccountPoolAttemptContext {
  account: GitHubAccount;
}

type LastFailure<T> =
  | { type: "result"; result: T }
  | { type: "error"; error: unknown };

const markModelUnavailable = async (
  account: GitHubAccount,
  model: string,
  status: number,
): Promise<void> => {
  await markAccountModelBackoff(account.user.id, model, status);
};

const clearModelUnavailable = async (
  accounts: GitHubAccount[],
  model: string,
): Promise<void> => {
  await clearModelBackoffs(accounts.map((account) => account.user.id), model);
};

const isUnavailable = async (
  account: GitHubAccount,
  model: string,
): Promise<boolean> => {
  return await isAccountModelBackedOff(account.user.id, model);
};

const switchableStatusFromError = (error: unknown): number | null => {
  if (
    isCopilotTokenFetchError(error) && isAccountSwitchableStatus(error.status)
  ) {
    return error.status;
  }
  if (
    error instanceof ModelsFetchError && isAccountSwitchableStatus(error.status)
  ) {
    return error.status;
  }
  return null;
};

export const switchableStatusFromResult = (result: unknown): number | null => {
  if (result instanceof Response) {
    return isAccountSwitchableStatus(result.status) ? result.status : null;
  }

  const maybeResult = result as { type?: unknown; status?: unknown };
  if (
    maybeResult?.type === "upstream-error" &&
    typeof maybeResult.status === "number" &&
    isAccountSwitchableStatus(maybeResult.status)
  ) {
    return maybeResult.status;
  }

  return null;
};

const eligibleAccountsForModel = async (
  accounts: GitHubAccount[],
  model: string,
): Promise<GitHubAccount[]> => {
  const matches: GitHubAccount[] = [];

  for (const account of accounts) {
    const result = await loadModelsForAccount(account);
    if (result.type === "models") {
      if (findModelInModels(result.data, model)) matches.push(account);
      continue;
    }

    if (isSwitchableModelsLoadError(result.error)) {
      const status = switchableStatusFromError(result.error);
      if (status) await markModelUnavailable(account, model, status);
    }
  }

  return matches.length > 0 ? matches : accounts;
};

const availableAccountsForModel = async (
  accounts: GitHubAccount[],
  model: string,
): Promise<GitHubAccount[]> => {
  const checks = await Promise.all(accounts.map(async (account) => ({
    account,
    unavailable: await isUnavailable(account, model),
  })));
  return checks
    .filter((check) => !check.unavailable)
    .map((check) => check.account);
};

const extractErrorBody = (result: unknown): string | null => {
  const maybeResult = result as { body?: unknown };
  if (typeof maybeResult?.body === "string") return maybeResult.body.slice(0, 4096);
  if (maybeResult?.body && typeof maybeResult.body === "object") {
    try {
      return JSON.stringify(maybeResult.body).slice(0, 4096);
    } catch {
      return null;
    }
  }
  return null;
};

const logError = (
  ctx: ErrorLogContext,
  account: GitHubAccount,
  model: string,
  status: number,
  errorBody: string | null,
  wasFallback: boolean,
): void => {
  getRepo().errorLog.log({
    accountId: account.user.id,
    apiKeyId: ctx.apiKeyId ?? null,
    model,
    endpoint: ctx.endpoint,
    statusCode: status,
    errorBody,
    wasFallback,
  }).catch(() => {});
};

export interface ErrorLogContext {
  endpoint: string;
  apiKeyId?: string;
}

export async function withAccountFallback<T>(
  model: string,
  run: (ctx: AccountPoolAttemptContext) => Promise<T>,
  preferredAccountId?: number,
  errorLogContext?: ErrorLogContext,
): Promise<T> {
  const accounts = await getRepo().github.listAccounts();
  if (accounts.length === 0) {
    throw new Error("No GitHub account connected — add one via the dashboard");
  }

  const eligible = await eligibleAccountsForModel(accounts, model);
  let attempts = await availableAccountsForModel(eligible, model);
  if (attempts.length === 0) {
    await clearModelUnavailable(eligible, model);
    attempts = eligible;
  }

  if (preferredAccountId !== undefined) {
    const preferredIndex = attempts.findIndex((a) => a.user.id === preferredAccountId);
    if (preferredIndex > 0) {
      const [preferred] = attempts.splice(preferredIndex, 1);
      attempts.unshift(preferred);
    }
  }

  let lastFailure: LastFailure<T> | null = null;

  for (const account of attempts) {
    try {
      const result = await run({ account });
      const status = switchableStatusFromResult(result);
      if (!status) return result;

      await markModelUnavailable(account, model, status);
      if (errorLogContext) {
        const errorBody = extractErrorBody(result);
        logError(errorLogContext, account, model, status, errorBody, attempts.indexOf(account) > 0);
      }
      lastFailure = { type: "result", result };
    } catch (error) {
      const status = switchableStatusFromError(error);
      if (!status) throw error;

      await markModelUnavailable(account, model, status);
      if (errorLogContext) {
        logError(errorLogContext, account, model, status, null, attempts.indexOf(account) > 0);
      }
      lastFailure = { type: "error", error };
    }
  }

  if (lastFailure?.type === "result") return lastFailure.result;
  if (lastFailure?.type === "error") throw lastFailure.error;

  throw new Error(`No GitHub account is eligible for model ${model}`);
}
