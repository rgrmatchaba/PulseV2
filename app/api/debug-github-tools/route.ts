import { NextResponse } from "next/server";
import { createGitHubMCPClient } from "@/lib/mcp-client";

export async function GET() {
  const client = await createGitHubMCPClient();
  const { tools } = await client.listTools();
  await client.close();

  return NextResponse.json({
    count: tools.length,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
}