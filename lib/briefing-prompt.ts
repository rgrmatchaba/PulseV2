import { PULSE_SLJ_BRIEFING_SYSTEM } from "./pulse-persona";

export const BRIEFING_SYSTEM_PROMPT = PULSE_SLJ_BRIEFING_SYSTEM;

export function buildBriefingUserPrompt(contextBlock: string): string {
  return `Give me my cross-platform standup briefing using ONLY this context. Follow the rules exactly. Stay in Samuel L. Jackson / Nick Fury voice throughout.

${contextBlock}`;
}
