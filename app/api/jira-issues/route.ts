import { NextResponse } from "next/server";
import { createAtlassianMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";

// Strip markdown code fences and parse JSON — Atlassian MCP may wrap responses in ```json
function parseJSON<T = unknown>(raw: string): T | null {
  try {
    const clean = raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const boardId = process.env.JIRA_BOARD_ID;
    const projectKey = process.env.JIRA_PROJECT_KEY;

    if (!boardId || !projectKey) {
      return NextResponse.json({ error: "Missing JIRA_BOARD_ID or JIRA_PROJECT_KEY" }, { status: 500 });
    }

    const client = await createAtlassianMCPClient();

    // Step 1: get active sprint
    const sprintRaw = await executeMCPTool(client, "jira_get_sprints_from_board", {
      board_id: boardId,
      state: "active",
    });

    let sprintId: number | null = null;
    let sprintName = "Active Sprint";

    const sprintParsed = parseJSON<Record<string, unknown> | unknown[]>(sprintRaw);
    if (sprintParsed) {
      const sprints = Array.isArray(sprintParsed)
        ? sprintParsed
        : ((sprintParsed as Record<string, unknown>)?.values as unknown[]) ?? [];
      if (sprints.length > 0) {
        const s = sprints[0] as Record<string, unknown>;
        sprintId = s.id as number;
        sprintName = (s.name as string) ?? sprintName;
      }
    }

    let tickets: unknown[] = [];

    if (sprintId) {
      // Step 2: get sprint issues
      const issuesRaw = await executeMCPTool(client, "jira_get_sprint_issues", {
        sprint_id: sprintId,
      });
      const issuesParsed = parseJSON<Record<string, unknown> | unknown[]>(issuesRaw);
      if (issuesParsed) {
        tickets = Array.isArray(issuesParsed)
          ? issuesParsed
          : ((issuesParsed as Record<string, unknown>)?.issues as unknown[]) ?? [];
      }
    } else {
      // Fallback: search by project
      const searchRaw = await executeMCPTool(client, "jira_search", {
        jql: `project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`,
        limit: 20,
      });
      const searchParsed = parseJSON<Record<string, unknown> | unknown[]>(searchRaw);
      if (searchParsed) {
        tickets = Array.isArray(searchParsed)
          ? searchParsed
          : ((searchParsed as Record<string, unknown>)?.issues as unknown[]) ?? [];
      }
    }

    await client.close();

    return NextResponse.json({ tickets, sprintName });
  } catch (err) {
    console.error("jira-issues error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
