import { NextRequest, NextResponse } from "next/server";
import { speak } from "@/lib/tts";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

  const audioBuffer = await speak(text);

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": audioBuffer.length.toString(),
    },
  });
}
