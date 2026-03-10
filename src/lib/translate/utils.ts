const MAX_CONSECUTIVE_WHITESPACE = 20;

export function checkWhitespaceOverflow(text: string, currentCount: number): { count: number; exceeded: boolean } {
  let wsCount = currentCount;
  for (const ch of text) {
    if (ch === "\r" || ch === "\n" || ch === "\t") {
      wsCount++;
      if (wsCount > MAX_CONSECUTIVE_WHITESPACE) return { count: wsCount, exceeded: true };
    } else if (ch !== " ") {
      wsCount = 0;
    }
  }
  return { count: wsCount, exceeded: false };
}

export function encodeSignature(encryptedContent: string, reasoningId: string): string {
  return `${encryptedContent}@${reasoningId}`;
}

export function decodeSignature(signature: string): { encryptedContent: string; reasoningId: string | undefined } {
  const atIndex = signature.lastIndexOf("@");
  if (atIndex === -1) return { encryptedContent: signature, reasoningId: undefined };
  return { encryptedContent: signature.slice(0, atIndex), reasoningId: signature.slice(atIndex + 1) };
}

export function isResponsesOriginSignature(signature: string | undefined): boolean {
  return signature?.includes("@") ?? false;
}

export function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : { raw_arguments: s };
  } catch {
    return { raw_arguments: s };
  }
}

import type { AnthropicMessagesPayload, AnthropicThinkingBlock } from "../anthropic-types.ts";

/**
 * Filter invalid thinking blocks for native Messages API.
 * Invalid: empty thinking, "Thinking..." placeholder, signatures with "@" (Responses API origin).
 */
export function filterThinkingBlocks(payload: AnthropicMessagesPayload): void {
  for (const msg of payload.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      msg.content = msg.content.filter((block) => {
        if (block.type !== "thinking") return true;
        const tb = block as AnthropicThinkingBlock;
        if (!tb.thinking || tb.thinking === "Thinking...") return false;
        if (tb.signature?.includes("@")) return false;
        return true;
      });
    }
  }
}
