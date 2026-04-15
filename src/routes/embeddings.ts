// POST /v1/embeddings — passthrough to Copilot

import type { Context } from "hono";
import { copilotFetch } from "../lib/copilot.ts";
import { getGithubCredentials } from "../lib/github.ts";
import {
  apiErrorResponse,
  getErrorMessage,
  proxyJsonResponse,
} from "./proxy-utils.ts";

export const embeddings = async (c: Context) => {
  try {
    const body = await c.req.text();
    const githubAccountId = c.get("githubAccountId") as number | undefined;
    const { token: githubToken, accountType } = await getGithubCredentials(githubAccountId);
    const resp = await copilotFetch(
      "/embeddings",
      { method: "POST", body },
      githubToken,
      accountType,
    );

    return proxyJsonResponse(resp);
  } catch (e: unknown) {
    return apiErrorResponse(c, getErrorMessage(e), 502);
  }
};
