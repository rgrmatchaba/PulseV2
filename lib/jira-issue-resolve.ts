import { getActiveSprint, getSprintIssues, searchIssues } from "./jira-api";

export type JiraIssueCandidate = { key: string; summary: string; score: number };

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "about",
  "from",
  "into",
  "with",
  "that",
  "this",
  "ticket",
  "jira",
  "status",
  "move",
]);

function hintKeywords(hint: string): string[] {
  return hint
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function scoreSummary(summary: string, hint: string): number {
  const words = hintKeywords(hint);
  if (words.length === 0) return 0;
  const s = summary.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (s.includes(w)) hits++;
  }
  return hits / words.length;
}

async function loadProjectIssues(
  projectKey: string,
  boardId: string
): Promise<{ key: string; summary: string }[]> {
  const issues: { key: string; summary: string }[] = [];

  if (boardId) {
    try {
      const sprintData = await getActiveSprint(boardId);
      const sprints: { id?: number }[] = sprintData.values ?? [];
      if (sprints.length > 0 && sprints[0].id) {
        const issueData = await getSprintIssues(sprints[0].id);
        for (const issue of issueData.issues ?? []) {
          const fields = issue.fields as { summary?: string } | undefined;
          if (issue.key && fields?.summary) {
            issues.push({ key: issue.key as string, summary: fields.summary });
          }
        }
        if (issues.length > 0) return issues;
      }
    } catch (err) {
      console.warn("[Pulse] Sprint issue load failed:", err);
    }
  }

  try {
    const data = await searchIssues(
      `project = ${projectKey} ORDER BY updated DESC`,
      30
    );
    for (const issue of data.issues ?? []) {
      const fields = issue.fields as { summary?: string } | undefined;
      if (issue.key && fields?.summary) {
        issues.push({ key: issue.key as string, summary: fields.summary });
      }
    }
  } catch (err) {
    console.warn("[Pulse] JQL issue load failed:", err);
  }

  return issues;
}

export type IssueResolveResult =
  | { kind: "match"; key: string; summary: string }
  | { kind: "ambiguous"; options: { key: string; summary: string }[] }
  | { kind: "none" };

/** Match sprint/backlog issues by spoken description (summary fuzzy match). */
export async function findIssueKeyBySummaryHint(
  hint: string,
  projectKey: string,
  boardId: string
): Promise<IssueResolveResult> {
  const issues = await loadProjectIssues(projectKey, boardId);
  if (issues.length === 0) return { kind: "none" };

  const scored: JiraIssueCandidate[] = issues
    .map((i) => ({ ...i, score: scoreSummary(i.summary, hint) }))
    .filter((i) => i.score >= 0.34)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };

  const top = scored[0];
  const close = scored.filter((s) => s.score >= top.score - 0.08).slice(0, 3);

  if (close.length > 1 && close[1].score >= top.score - 0.05) {
    return {
      kind: "ambiguous",
      options: close.map((c) => ({ key: c.key, summary: c.summary })),
    };
  }

  return { kind: "match", key: top.key, summary: top.summary };
}
