import type { ExecuteResult } from "./shared/errors/result.ts";
import { markCooldown } from "../../lib/account-cooldown.ts";
import {
  getGithubCredentialsWithFallback,
  type CredentialResult,
} from "../../lib/github.ts";
import { getRepo } from "../../repo/index.ts";

export interface FallbackContext {
  apiKeyId?: string;
  model?: string;
  endpoint: string;
}

const logError = (
  cred: CredentialResult,
  status: number,
  body: Uint8Array | null,
  ctx: FallbackContext,
  wasFallback: boolean,
) => {
  getRepo().errorLog.log({
    accountId: cred.accountId,
    apiKeyId: ctx.apiKeyId ?? null,
    model: ctx.model ?? null,
    endpoint: ctx.endpoint,
    statusCode: status,
    errorBody: body ? new TextDecoder().decode(body).slice(0, 4096) : null,
    wasFallback,
  }).catch(() => {});
};

export const withAccountFallback = async <T>(
  preferredAccountId: number | undefined,
  execute: (cred: CredentialResult) => Promise<ExecuteResult<T>>,
  ctx: FallbackContext,
): Promise<{ result: ExecuteResult<T>; cred: CredentialResult }> => {
  const cred = await getGithubCredentialsWithFallback(preferredAccountId);
  const result = await execute(cred);

  if (result.type === "upstream-error" && result.status >= 400) {
    logError(cred, result.status, result.body, ctx, false);
  }
  if (result.type === "internal-error" && result.status >= 400) {
    logError(cred, result.status, null, ctx, false);
  }

  if (result.type === "upstream-error" && result.status === 429) {
    markCooldown(cred.accountId);
    const fallbackCred = await getGithubCredentialsWithFallback(preferredAccountId);

    if (fallbackCred.accountId !== cred.accountId) {
      const retryResult = await execute(fallbackCred);

      if (retryResult.type === "upstream-error" && retryResult.status >= 400) {
        logError(fallbackCred, retryResult.status, retryResult.body, ctx, true);
      }
      if (retryResult.type === "internal-error" && retryResult.status >= 400) {
        logError(fallbackCred, retryResult.status, null, ctx, true);
      }

      return { result: retryResult, cred: fallbackCred };
    }
  }

  return { result, cred };
};

// Simplified fallback for non-ExecuteResult endpoints (models, embeddings)
export const withSimpleAccountFallback = async (
  preferredAccountId: number | undefined,
  execute: (cred: CredentialResult) => Promise<Response>,
  ctx?: FallbackContext,
): Promise<{ response: Response; cred: CredentialResult }> => {
  const cred = await getGithubCredentialsWithFallback(preferredAccountId);
  const response = await execute(cred);

  if (response.status >= 400 && ctx) {
    logError(cred, response.status, null, ctx, false);
  }

  if (response.status === 429) {
    markCooldown(cred.accountId);
    const fallbackCred = await getGithubCredentialsWithFallback(preferredAccountId);

    if (fallbackCred.accountId !== cred.accountId) {
      const retryResponse = await execute(fallbackCred);

      if (retryResponse.status >= 400 && ctx) {
        logError(fallbackCred, retryResponse.status, null, ctx, true);
      }

      return { response: retryResponse, cred: fallbackCred };
    }
  }

  return { response, cred };
};
