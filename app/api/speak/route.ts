import { NextResponse } from "next/server";
import { createGitHubMCPClient } from "@/lib/mcp-client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { speak } from "@/lib/tts";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  return text;
}

const parseJSON = (raw: string): unknown[] => {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export async function GET() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!owner || !repo) {
    return NextResponse.json({ error: "Missing GITHUB_OWNER or GITHUB_REPO" }, { status: 500 });
  }

  // Step 1: Fetch all data directly — no agentic loop
  const client = await createGitHubMCPClient();
  const [issuesRaw, prsRaw, commitsRaw] = await Promise.all([
    callTool(client, "list_issues", { owner, repo, state: "open" }),
    callTool(client, "list_pull_requests", { owner, repo, state: "open" }),
    callTool(client, "list_commits", { owner, repo, perPage: 5 }),
  ]);
  await client.close();

  const issues = parseJSON(issuesRaw) as Array<{ title?: string; number?: number }>;
  const prs = parseJSON(prsRaw) as Array<{ title?: string; number?: number }>;
  const commits = parseJSON(commitsRaw) as Array<{ commit?: { message?: string }; sha?: string; message?: string }>;

  // Build a compact data summary to pass to the LLM
  const commitLines = commits
    .slice(0, 5)
    .map((c, i) => {
      const msg = c.commit?.message ?? c.message ?? "unknown";
      return `${i + 1}. ${msg.split("\n")[0]}`;
    })
    .join("\n");

  const issueSummary = issues.length === 0
    ? "No open issues."
    : issues.slice(0, 5).map((i) => `- #${i.number}: ${i.title}`).join("\n");

  const prSummary = prs.length === 0
    ? "No open pull requests."
    : prs.slice(0, 5).map((p) => `- #${p.number}: ${p.title}`).join("\n");

  // Step 2: Single LLM call to generate the briefing
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are Pulse, a voice-powered engineering co-pilot with the attitude and directness of Samuel L. Jackson — confident, no-nonsense, a little edge, funny, and sarcastic, but always professional. Keep responses under 150 words.",
      },
      {
        role: "user",
        content: `Give me a voice briefing for repo ${owner}/${repo}.

COMMITS (read each one out):
${commitLines}

OPEN ISSUES (${issues.length} total):
${issueSummary}

OPEN PULL REQUESTS (${prs.length} total):
${prSummary}

Read out each commit message. Then briefly cover issues and PRs.`,
      },
    ],
  });

  const briefingText = response.choices[0]?.message?.content ?? "No briefing generated.";

  // Step 3: TTS
  const audioBuffer = await speak(briefingText);

  return new NextResponse(new Uint8Array(audioBuffer), {
    headers: {
      "Content-Type": "audio/mpeg",
    },
  });
}
