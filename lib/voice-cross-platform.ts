import Groq from "groq-sdk";
import { gatherBriefingContext, formatBriefingContext } from "./briefing-context";
import { pulsePersonaSystem, PULSE_CROSS_PLATFORM_RULES } from "./pulse-persona";
import { sanitizeSpokenReply, stripModelThinking } from "./spoken-reply";
import {
  PULSE_MULTI_TURN_RULES,
  trimVoiceContext,
  type VoiceContextMessage,
} from "./voice-session";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function executeCrossPlatformSummary(
  transcript: string,
  conversation: VoiceContextMessage[] = []
): Promise<string> {
  const ctx = await gatherBriefingContext();
  const contextBlock = formatBriefingContext(ctx);
  const history = trimVoiceContext(conversation).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 500,
    temperature: 0.4,
    messages: [
      pulsePersonaSystem(`${PULSE_CROSS_PLATFORM_RULES}\n\n${PULSE_MULTI_TURN_RULES}`),
      ...history,
      {
        role: "user",
        content: `User request: ${transcript}

Use ONLY this live data:

${contextBlock}

Give a complete spoken answer now.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const text = stripModelThinking(raw);
  return sanitizeSpokenReply(
    text || "I pulled your Jira and GitHub data but couldn't build the summary — try again.",
    { maxChars: 400 }
  );
}
