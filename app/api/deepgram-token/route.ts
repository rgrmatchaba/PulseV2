import { DeepgramClient } from "@deepgram/sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Short-lived token so the browser can stream audio to Deepgram without exposing the main API key. */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing DEEPGRAM_API_KEY" }, { status: 500 });
  }

  try {
    const client = new DeepgramClient({ apiKey });
    const grant = await client.auth.v1.tokens.grant({ ttl_seconds: 120 });
    return NextResponse.json({
      token: grant.access_token,
      expiresIn: grant.expires_in,
    });
  } catch (err) {
    console.error("[Pulse] deepgram-token error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
