import { NextResponse } from "next/server";
import { createAtlassianMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";

export async function GET() {
  const boardId = process.env.JIRA_BOARD_ID;
  const projectKey = process.env.JIRA_PROJECT_KEY;

  const steps: Record<string, unknown> = { boardId, projectKey };

  try {
    const client = await createAtlassianMCPClient();
    steps.connected = true;

    // Raw sprint response
    const sprintRaw = await executeMCPTool(client, "jira_get_sprints_from_board", {
      board_id: boardId ?? "0",
      state: "active",
    });
    steps.sprintRaw = sprintRaw;

    // Try parse
    try {
      const clean = sprintRaw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      steps.sprintParsed = JSON.parse(clean);
    } catch (e) {
      steps.sprintParseError = String(e);
    }

    // Raw sprint issues (if we got a sprint id)
    const sprintParsed = steps.sprintParsed as Record<string, unknown> | unknown[] | null;
    if (sprintParsed) {
      const sprints = Array.isArray(sprintParsed)
        ? sprintParsed
        : ((sprintParsed as Record<string, unknown>)?.values as unknown[]) ?? [];
      if (sprints.length > 0) {
        const sprintId = (sprints[0] as Record<string, unknown>).id;
        steps.sprintId = sprintId;
        const issuesRaw = await executeMCPTool(client, "jira_get_sprint_issues", {
          sprint_id: sprintId,
        });
        steps.issuesRaw = issuesRaw;
        try {
          const clean = issuesRaw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
          steps.issuesParsed = JSON.parse(clean);
        } catch (e) {
          steps.issuesParseError = String(e);
        }
      } else {
        steps.sprintNote = "No active sprints found in parsed result";
      }
    }

    // Also try JQL fallback
    const searchRaw = await executeMCPTool(client, "jira_search", {
      jql: `project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`,
      limit: 5,
    });
    steps.searchRaw = searchRaw;
    try {
      const clean = searchRaw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      steps.searchParsed = JSON.parse(clean);
    } catch (e) {
      steps.searchParseError = String(e);
    }

    await client.close();
  } catch (err) {
    steps.error = String(err);
  }

  return NextResponse.json(steps, { status: 200 });
}
