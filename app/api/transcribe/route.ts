import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing DEEPGRAM_API_KEY" }, { status: 500 });
    }

    const contentType = req.headers.get("content-type") ?? "audio/webm";
    const audioBuffer = await req.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ transcript: "" });
    }

    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType,
        },
        body: audioBuffer,
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Deepgram STT error:", res.status, body);
      return NextResponse.json({ error: `Deepgram ${res.status}: ${body}` }, { status: 500 });
    }

    const json = await res.json();
    const transcript =
      json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
