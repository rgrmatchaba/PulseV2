import { NextResponse } from "next/server";
import { gatherBriefingContext, formatBriefingContext } from "@/lib/briefing-context";
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingUserPrompt,
} from "@/lib/briefing-prompt";
import { speak } from "@/lib/tts";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function GET() {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "Missing GROQ_API_KEY" }, { status: 500 });
  }

  try {
    const ctx = await gatherBriefingContext();
    const contextBlock = formatBriefingContext(ctx);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 500,
      messages: [
        { role: "system", content: BRIEFING_SYSTEM_PROMPT },
        { role: "user", content: buildBriefingUserPrompt(contextBlock) },
      ],
    });

    const briefingText =
      response.choices[0]?.message?.content ?? "No briefing generated.";
    console.log("[Pulse] play briefing text:", briefingText);

    const audioBuffer = await speak(briefingText);
    const body = new Uint8Array(audioBuffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": body.byteLength.toString(),
      },
    });
  } catch (err) {
    console.error("[Pulse] speak/briefing error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
