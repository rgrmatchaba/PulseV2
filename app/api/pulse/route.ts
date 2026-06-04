import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { pulsePersonaSystem } from "@/lib/pulse-persona";

export const dynamic = "force-dynamic";

export async function GET() {
  const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  const message = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 256,
    messages: [
      pulsePersonaSystem(),
      {
        role: "user",
        content:
          "Say hello as Pulse, a voice-powered engineering co-pilot. One sentence only. Samuel L. Jackson / Nick Fury energy.",
      },
    ],
  });

  const text = message.choices[0]?.message?.content ?? "";

  return NextResponse.json({ message: text });
}
