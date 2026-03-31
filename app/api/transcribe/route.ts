import { DeepgramClient } from "@deepgram/sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * Prerecorded STT via Deepgram Listen REST API (SDK v5).
 * @see https://developers.deepgram.com/docs/pre-recorded-audio
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing DEEPGRAM_API_KEY" },
        { status: 500 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const contentType = req.headers.get("content-type") ?? "audio/webm";

    const deepgram = new DeepgramClient({ apiKey });

    const result = await deepgram.listen.v1.media.transcribeFile(
      { data: audioBuffer, contentType },
      {
        model: "nova-2",
        smart_format: true,
        language: "en",
      }
    );

    const transcript =
      "results" in result
        ? (result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "")
        : "";

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
