import Groq, { APIError } from "groq-sdk";
import type {
  ChatCompletion,
  ChatCompletionCreateParams,
} from "groq-sdk/resources/chat/completions";

export const GROQ_TOOL_CALLING_MODEL =
  process.env.GROQ_TOOL_MODEL ?? "llama-3.3-70b-versatile";

export function toolCallingSystemMessage(): Groq.Chat.ChatCompletionSystemMessageParam {
  return {
    role: "system",
    content:
      "You must invoke tools only through the API's function-calling mechanism. " +
      "Never output XML tags, <function=...>, or any plain-text pseudo tool syntax. " +
      "Use only the provided function names with JSON arguments matching each tool schema.",
  };
}

function isToolUseFailed(err: unknown): boolean {
  if (!(err instanceof APIError) || err.status !== 400) return false;
  const body = err.error as { error?: { code?: string } } | undefined;
  return body?.error?.code === "tool_use_failed";
}

type GroqClient = InstanceType<typeof Groq>;

/**
 * Wraps chat.completions.create with retries when Groq rejects malformed tool syntax
 * (invalid_request_error / tool_use_failed).
 */
export async function createGroqChatCompletion(
  client: GroqClient,
  params: ChatCompletionCreateParams
): Promise<ChatCompletion> {
  const maxAttempts = 4;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await client.chat.completions.create({
        ...params,
        stream: false,
        ...(attempt > 0 ? { temperature: 0.5 } : {}),
      });
    } catch (err) {
      lastError = err;
      if (!isToolUseFailed(err) || attempt === maxAttempts - 1) {
        throw err;
      }
    }
  }

  throw lastError;
}
