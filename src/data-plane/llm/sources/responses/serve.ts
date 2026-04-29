import type { Context } from "hono";
import type { ResponsesPayload } from "../../../../lib/responses-types.ts";
import { normalizeResponsesRequest } from "./normalize/request.ts";
import { planResponsesRequest } from "./plan.ts";
import { getModelCapabilities } from "../../shared/models/get-model-capabilities.ts";
import { buildTargetRequest as buildMessagesTargetRequest } from "../../translate/responses-via-messages/build-target-request.ts";
import { buildTargetRequest as buildChatCompletionsTargetRequest } from "../../translate/responses-via-chat-completions/build-target-request.ts";
import { emitToResponses } from "../../targets/responses/emit.ts";
import { emitToMessages } from "../../targets/messages/emit.ts";
import { emitToChatCompletions } from "../../targets/chat-completions/emit.ts";
import { translateToSourceEvents } from "../../translate/responses-via-messages/translate-to-source-events.ts";
import { translateToSourceEvents as translateChatCompletionsToSourceEvents } from "../../translate/responses-via-chat-completions/translate-to-source-events.ts";
import { respondResponses } from "./respond.ts";
import {
  internalErrorResult,
  type StreamExecuteResult,
} from "../../shared/errors/result.ts";
import { toInternalDebugError } from "../../shared/errors/internal-debug-error.ts";
import type { ProtocolFrame } from "../../shared/stream/types.ts";
import type { SourceResponseStreamEvent } from "./events/protocol.ts";
import { withAccountFallback } from "../../with-fallback.ts";

const withTranslatedEvents = <T>(
  result: StreamExecuteResult<T>,
  translate: (
    events: AsyncIterable<ProtocolFrame<T>>,
  ) => AsyncIterable<ProtocolFrame<SourceResponseStreamEvent>>,
): StreamExecuteResult<SourceResponseStreamEvent> =>
  result.type === "events"
    ? { type: "events", events: translate(result.events) }
    : result;

const unsupportedResponsesModelResponse = (model: string): Response =>
  Response.json({
    error: {
      message: `Model ${model} does not support the /responses endpoint.`,
      type: "invalid_request_error",
    },
  }, { status: 400 });

const createTranslatedResponseId = (): string =>
  `resp_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

export const serveResponses = async (
  c: Context,
): Promise<Response> => {
  try {
    const payload = await c.req.json<ResponsesPayload>();
    normalizeResponsesRequest(payload);
    c.set("model", payload.model || "unknown");
    const apiKeyId = c.get("apiKeyId") as string | undefined;
    let wantsStream = false;
    let unsupportedModel = false;

    const { result } = await withAccountFallback(
      c.get("githubAccountId") as number | undefined,
      async (cred) => {
        const capabilities = await getModelCapabilities(
          payload.model,
          cred.token,
          cred.accountType,
        );
        const plan = planResponsesRequest(payload, capabilities);
        if (!plan) {
          unsupportedModel = true;
          return internalErrorResult(400, toInternalDebugError(
            new Error(`Model ${payload.model} does not support the /responses endpoint.`),
            "responses",
          ));
        }
        wantsStream = plan.wantsStream;
        payload.model = capabilities.model?.id ?? payload.model;

        if (plan.target === "responses") {
          return await emitToResponses({
            sourceApi: "responses",
            payload,
            githubToken: cred.token,
            accountType: cred.accountType,
            fetchOptions: plan.fetchOptions,
          });
        }

        if (plan.target === "messages") {
          const messagesPayload = await buildMessagesTargetRequest(payload);
          const result = await emitToMessages({
            sourceApi: "responses",
            payload: messagesPayload,
            githubToken: cred.token,
            accountType: cred.accountType,
            apiKeyId,
            fetchOptions: plan.fetchOptions,
          });

          return withTranslatedEvents(
            result,
            (events) =>
              translateToSourceEvents(
                events,
                createTranslatedResponseId(),
                messagesPayload.model,
              ),
          );
        }

        const chatPayload = buildChatCompletionsTargetRequest(payload);
        const result = await emitToChatCompletions({
          sourceApi: "responses",
          payload: chatPayload,
          githubToken: cred.token,
          accountType: cred.accountType,
          fetchOptions: plan.fetchOptions,
        });

        return withTranslatedEvents(result, translateChatCompletionsToSourceEvents);
      },
      { apiKeyId, model: payload.model, endpoint: "/v1/responses" },
    );

    if (unsupportedModel) {
      return unsupportedResponsesModelResponse(payload.model);
    }

    return await respondResponses(c, result, wantsStream);
  } catch (error) {
    return await respondResponses(
      c,
      internalErrorResult(502, toInternalDebugError(error, "responses")),
      false,
    );
  }
};
