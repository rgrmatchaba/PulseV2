import Groq from "groq-sdk";
import { gatherBriefingContext, formatBriefingContext } from "./briefing-context";
import { PULSE_LANDING_SYSTEM } from "./pulse-persona";
import { fetchTechHeadlines, formatTechHeadlinesForAgent } from "./tech-news-fetch";
import { getLandingGreeting } from "./time-theme";
import { fetchWeatherBrief } from "./weather-fetch";

function userDisplayName(): string {
  return process.env.PULSE_USER_NAME?.trim() || "Rue";
}

export async function generateLandingRoutine(): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Missing GROQ_API_KEY");
  }

  const name = userDisplayName();
  const greetingLine = getLandingGreeting(name);

  const [weather, headlines, briefingCtx] = await Promise.all([
    fetchWeatherBrief().catch(() => null),
    fetchTechHeadlines().catch(() => []),
    gatherBriefingContext().catch(() => null),
  ]);

  const weatherBlock = weather
    ? weather.summaryForAgent
    : "Weather unavailable — skip detailed weather, say you'll check the window.";
  const techBlock = formatTechHeadlinesForAgent(headlines);
  const briefingBlock = briefingCtx
    ? formatBriefingContext(briefingCtx)
    : "Briefing context unavailable — give a short motivational send-off into the dashboard.";

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 900,
    messages: [
      { role: "system", content: PULSE_LANDING_SYSTEM },
      {
        role: "user",
        content: `Write the full landing spoken script for ${name}.

GREETING (use exactly): ${greetingLine}

WEATHER DATA:
${weatherBlock}

TECH HEADLINES (use all four in section 4 — pick the top 4 if more listed):
${techBlock}

ENGINEERING BRIEFING CONTEXT:
${briefingBlock}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty landing routine from model");

  console.log("[Pulse] landing routine length:", text.length);
  return text;
}
