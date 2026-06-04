import { NextResponse } from "next/server";
import { generateLandingRoutine } from "@/lib/landing-routine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const text = await generateLandingRoutine();
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[Pulse] landing-routine error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
