import { NextResponse } from "next/server";
import { generateBriefing } from "@/lib/briefing";

export async function GET() {
  try {
    const text = await generateBriefing();
    return NextResponse.json({ text });
  } catch (err) {
    console.error("briefing error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
