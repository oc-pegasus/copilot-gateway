// GET /v1/models, /api/models — proxy to Copilot models endpoint

import type { Context } from "hono";
import { copilotFetch } from "../../lib/copilot.ts";
import {
  apiErrorResponse,
  getErrorMessage,
  proxyJsonResponse,
} from "../shared/http/proxy-response.ts";
import { withSimpleAccountFallback } from "../llm/with-fallback.ts";

export const models = async (c: Context) => {
  try {
    const { response } = await withSimpleAccountFallback(
      c.get("githubAccountId") as number | undefined,
      async (cred) => {
        return await copilotFetch(
          "/models",
          { method: "GET" },
          cred.token,
          cred.accountType,
        );
      },
      { endpoint: "/v1/models" },
    );
    return proxyJsonResponse(response);
  } catch (e: unknown) {
    return apiErrorResponse(c, getErrorMessage(e), 502);
  }
};
