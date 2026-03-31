import { NextResponse } from "next/server";
import { createGitHubMCPClient } from "@/lib/mcp-client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  return text;
}

export async function GET() {
  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing GITHUB_OWNER or GITHUB_REPO" }, { status: 500 });
    }

    const client = await createGitHubMCPClient();

    // Fetch in parallel — open issues, open PRs, recent commits
    const [issuesRaw, prsRaw, commitsRaw] = await Promise.all([
      callTool(client, "list_issues", { owner, repo, state: "open" }),
      callTool(client, "list_pull_requests", { owner, repo, state: "open" }),
      callTool(client, "list_commits", { owner, repo, perPage: 10 }),
    ]);

    await client.close();

    // Parse JSON responses from MCP — strip any markdown fences if present
    const parseJSON = (raw: string): unknown[] => {
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const issues = parseJSON(issuesRaw);
    const prs = parseJSON(prsRaw);
    const commits = parseJSON(commitsRaw);

    return NextResponse.json({ issues, prs, commits, owner, repo });
  } catch (err) {
    console.error("github-issues error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}