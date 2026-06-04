import { NextResponse } from "next/server";
import { getActiveSprint, getSprintIssues, searchIssues } from "@/lib/jira-api";

function normaliseTicket(issue: Record<string, unknown>) {
  const fields = (issue.fields ?? {}) as Record<string, unknown>;
  const status = fields.status as Record<string, unknown> | undefined;
  const statusCat = (status?.statusCategory as Record<string, unknown> | undefined)?.name as string | undefined;
  return {
    id: issue.id as string,
    key: issue.key as string,
    summary: fields.summary as string | undefined,
    status: {
      name: status?.name as string | undefined,
      category: statusCat,
      color: statusCat === "Done" ? "green" : statusCat === "In Progress" ? "yellow" : "grey",
    },
    issue_type: { name: ((fields.issuetype as Record<string, unknown> | undefined)?.name as string | undefined) },
    priority: { name: ((fields.priority as Record<string, unknown> | undefined)?.name as string | undefined) },
    assignee: { display_name: ((fields.assignee as Record<string, unknown> | undefined)?.displayName as string | undefined) ?? "Unassigned" },
    reporter: { display_name: ((fields.reporter as Record<string, unknown> | undefined)?.displayName as string | undefined) },
    created: fields.created as string | undefined,
    updated: fields.updated as string | undefined,
  };
}

export async function GET() {
  const boardId = process.env.JIRA_BOARD_ID;
  const projectKey = process.env.JIRA_PROJECT_KEY;

  if (!boardId || !projectKey) {
    return NextResponse.json({ error: "Missing JIRA_BOARD_ID or JIRA_PROJECT_KEY" });
  }

  try {
    // Try active sprint first
    const sprintData = await getActiveSprint(boardId);
    const sprints: Record<string, unknown>[] = sprintData.values ?? [];

    if (sprints.length > 0) {
      const sprint = sprints[0];
      const sprintId = sprint.id as number;
      const sprintName = (sprint.name as string) ?? "Active Sprint";
      const issueData = await getSprintIssues(sprintId);
      const tickets = (issueData.issues as Record<string, unknown>[]).map(normaliseTicket);
      return NextResponse.json({ tickets, sprintName });
    }

    // Fallback: JQL search
    const data = await searchIssues(
      `project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`
    );
    const tickets = (data.issues as Record<string, unknown>[]).map(normaliseTicket);
    return NextResponse.json({ tickets, sprintName: "Recent Issues" });
  } catch (err) {
    const msg = String(err);
    console.error("jira-issues error:", msg);
    return NextResponse.json({ error: msg });
  }
}
