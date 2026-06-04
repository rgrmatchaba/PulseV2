import { NextRequest, NextResponse } from "next/server";
import { speak } from "@/lib/tts";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

  try {
    const buffer = await speak(text);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": buffer.length.toString() },
    });
  } catch (err) {
    console.error("[landing-speak] Deepgram error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
