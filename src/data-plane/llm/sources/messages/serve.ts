import type { Context } from "hono";
import type {
  MessagesPayload,
  MessagesStreamEventData,
} from "../../../../lib/messages-types.ts";
import { normalizeMessagesRequest } from "./normalize/request.ts";
import { planMessagesRequest } from "./plan.ts";
import { getModelCapabilities } from "../../shared/models/get-model-capabilities.ts";
import { buildTargetRequest as buildChatTargetRequest } from "../../translate/messages-via-chat-completions/build-target-request.ts";
import { buildTargetRequest as buildResponsesTargetRequest } from "../../translate/messages-via-responses/build-target-request.ts";
import { emitToMessages } from "../../targets/messages/emit.ts";
import { emitToResponses } from "../../targets/responses/emit.ts";
import { emitToChatCompletions } from "../../targets/chat-completions/emit.ts";
import { translateToSourceEvents as translateResponsesToSourceEvents } from "../../translate/messages-via-responses/translate-to-source-events.ts";
import { translateToSourceEvents as translateChatToSourceEvents } from "../../translate/messages-via-chat-completions/translate-to-source-events.ts";
import { respondMessages } from "./respond.ts";
import {
  internalErrorResult,
  type StreamExecuteResult,
} from "../../shared/errors/result.ts";
import { toInternalDebugError } from "../../shared/errors/internal-debug-error.ts";
import type { ProtocolFrame } from "../../shared/stream/types.ts";
import { withAccountFallback } from "../../with-fallback.ts";

const withTranslatedEvents = <T>(
  result: StreamExecuteResult<T>,
  translate: (
    events: AsyncIterable<ProtocolFrame<T>>,
  ) => AsyncIterable<ProtocolFrame<MessagesStreamEventData>>,
): StreamExecuteResult<MessagesStreamEventData> =>
  result.type === "events"
    ? { type: "events", events: translate(result.events) }
    : result;

export const serveMessages = async (
  c: Context,
): Promise<Response> => {
  try {
    const payload = await c.req.json<MessagesPayload>();
    normalizeMessagesRequest(payload);
    c.set("model", payload.model || "unknown");
    const apiKeyId = c.get("apiKeyId") as string | undefined;
    let wantsStream = false;

    const { result } = await withAccountFallback(
      c.get("githubAccountId") as number | undefined,
      async (cred) => {
        const capabilities = await getModelCapabilities(
          payload.model,
          cred.token,
          cred.accountType,
        );
        const plan = planMessagesRequest(
          payload,
          capabilities,
          c.req.header("anthropic-beta"),
        );
        wantsStream = plan.wantsStream;
        payload.model = capabilities.model?.id ?? payload.model;

        if (plan.target === "messages") {
          return await emitToMessages({
            sourceApi: "messages",
            payload,
            githubToken: cred.token,
            accountType: cred.accountType,
            apiKeyId,
            fetchOptions: plan.fetchOptions,
            rawBeta: plan.rawBeta,
          });
        }

        if (plan.target === "responses") {
          const result = await emitToResponses({
            sourceApi: "messages",
            payload: buildResponsesTargetRequest(payload),
            githubToken: cred.token,
            accountType: cred.accountType,
            apiKeyId,
            fetchOptions: plan.fetchOptions,
          });

          return withTranslatedEvents(result, translateResponsesToSourceEvents);
        }

        const result = await emitToChatCompletions({
          sourceApi: "messages",
          payload: buildChatTargetRequest(payload),
          githubToken: cred.token,
          accountType: cred.accountType,
          apiKeyId,
          fetchOptions: plan.fetchOptions,
        });

        return withTranslatedEvents(result, translateChatToSourceEvents);
      },
      { apiKeyId, model: payload.model, endpoint: "/v1/messages" },
    );

    return await respondMessages(c, result, wantsStream);
  } catch (error) {
    return await respondMessages(
      c,
      internalErrorResult(502, toInternalDebugError(error, "messages")),
      false,
    );
  }
};
