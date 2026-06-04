import { gatherBriefingContext, formatBriefingContext } from "./briefing-context";
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
} from "./briefing-prompt";
import Groq from "groq-sdk";

async function generateWithGroq(contextBlock: string): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 500,
    messages: [
      { role: "system", content: BRIEFING_SYSTEM_PROMPT },
      { role: "user", content: buildBriefingUserPrompt(contextBlock) },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

async function generateWithOllama(contextBlock: string): Promise<string> {
  const prompt = `${BRIEFING_SYSTEM_PROMPT}\n\n${buildBriefingUserPrompt(contextBlock)}`;

  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2",
      prompt,
      stream: false,
      options: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return (json.response as string) ?? "";
}

export async function generateBriefing(): Promise<string> {
  const ctx = await gatherBriefingContext();
  const contextBlock = formatBriefingContext(ctx);

  let text: string;
  if (process.env.GROQ_API_KEY) {
    text = await generateWithGroq(contextBlock);
  } else {
    text = await generateWithOllama(contextBlock);
  }

  console.log("[Pulse] briefing text:", text);
  return text;
}
