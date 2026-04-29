// POST /v1/embeddings — forward embedding requests to Copilot

import type { Context } from "hono";
import { copilotFetch } from "../../lib/copilot.ts";
import {
  apiErrorResponse,
  getErrorMessage,
  proxyJsonResponse,
} from "../shared/http/proxy-response.ts";
import { withSimpleAccountFallback } from "../llm/with-fallback.ts";

export const embeddings = async (c: Context) => {
  try {
    const body = await c.req.text();
    const { response } = await withSimpleAccountFallback(
      c.get("githubAccountId") as number | undefined,
      async (cred) => {
        return await copilotFetch(
          "/embeddings",
          { method: "POST", body },
          cred.token,
          cred.accountType,
        );
      },
      { endpoint: "/v1/embeddings" },
    );

    return proxyJsonResponse(response);
  } catch (e: unknown) {
    return apiErrorResponse(c, getErrorMessage(e), 502);
  }
};
