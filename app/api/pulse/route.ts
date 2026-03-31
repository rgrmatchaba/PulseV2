import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function GET() {
  const message = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that can answer questions and help with tasks. Answer in the tone and manner of Samuel L. Jackson.",
      },
      {
        role: "user",
        content: "Say hello as Pulse, a voice-powered engineering co-pilot. One sentence only.",
      },
    ],
  });

  const text = message.choices[0]?.message.content ?? "";

  return NextResponse.json({ message: text });
}