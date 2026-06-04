import {
  getActiveSprint,
  getCurrentUser,
  getIssueComments,
  getSprintIssues,
  searchIssues,
} from "./jira-api";
import {
  GitHubComment,
  GitHubCommit,
  GitHubIssue,
  GitHubPR,
  listIssueComments,
  listOpenIssues,
  listOpenPullRequests,
  listPullReviewComments,
  listRecentCommits,
} from "./github-api";

function extractAdfText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  const node = body as Record<string, unknown>;
  if (typeof node.text === "string") return node.text;
  const children = (node.content ?? node.children) as unknown[] | undefined;
  if (Array.isArray(children)) return children.map(extractAdfText).join(" ");
  return "";
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "your", "have",
  "will", "been", "were", "about", "when", "what", "need", "update", "fix",
]);

export type BriefingContext = {
  user: { jiraName: string; githubLogin: string };
  jira: {
    sprintName: string;
    activeWork: string[];
    upcoming: string[];
    sprintQueue: string[];
    teamPulse: string;
    attention: string[];
  };
  github: {
    activeWork: string[];
    activitySummary: string;
    attention: string[];
  };
  crossRefs: string[];
};

type JiraTicket = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  assignee: string;
  priority: string;
  updated: string;
};

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function parseJiraTicket(issue: Record<string, unknown>): JiraTicket {
  const f = (issue.fields ?? {}) as Record<string, unknown>;
  const status = (f.status ?? {}) as Record<string, unknown>;
  const statusCat = (status.statusCategory ?? {}) as Record<string, unknown>;
  return {
    key: issue.key as string,
    summary: (f.summary as string) ?? "",
    status: (status.name as string) ?? "Unknown",
    statusCategory: (statusCat.name as string) ?? "",
    assignee: ((f.assignee as Record<string, unknown> | undefined)?.displayName as string) ?? "Unassigned",
    priority: ((f.priority as Record<string, unknown> | undefined)?.name as string) ?? "None",
    updated: (f.updated as string) ?? "",
  };
}

function daysSince(iso: string): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function recentCommentSnippet(
  comments: Array<{ author?: string; body?: string; created?: string }>,
  excludeAuthor: string
): string | null {
  for (const c of comments) {
    if (c.author && c.author !== excludeAuthor && c.body) {
      const preview = c.body.replace(/\s+/g, " ").slice(0, 120);
      return `${c.author} (${c.created?.slice(0, 10) ?? "recent"}): ${preview}`;
    }
  }
  return null;
}

function findCrossRefs(
  tickets: JiraTicket[],
  issues: GitHubIssue[],
  prs: GitHubPR[],
  commits: GitHubCommit[]
): string[] {
  const refs: string[] = [];
  const ghTexts: Array<{ label: string; text: string }> = [
    ...issues.map((i) => ({ label: `issue #${i.number}`, text: i.title })),
    ...prs.map((p) => ({ label: `PR #${p.number}`, text: p.title })),
    ...commits.map((c) => ({
      label: `commit ${c.sha.slice(0, 7)}`,
      text: c.commit.message.split("\n")[0],
    })),
  ];

  for (const t of tickets) {
    const keyLower = t.key.toLowerCase();
    for (const gh of ghTexts) {
      if (gh.text.toLowerCase().includes(keyLower)) {
        refs.push(`${t.key} ↔ ${gh.label} (ticket key in GitHub text)`);
        continue;
      }
      const sim = textSimilarity(t.summary, gh.text);
      if (sim >= 0.35) {
        refs.push(`${t.key} "${t.summary}" ↔ ${gh.label} "${gh.text}" (topic overlap)`);
      }
    }
  }
  return [...new Set(refs)].slice(0, 8);
}

async function fetchJiraTickets(
  boardId: string,
  projectKey: string
): Promise<{ sprintName: string; tickets: JiraTicket[] }> {
  const sprintData = await getActiveSprint(boardId);
  const sprints: Record<string, unknown>[] = sprintData.values ?? [];

  if (sprints.length > 0) {
    const sprint = sprints[0];
    const data = await getSprintIssues(sprint.id as number);
    const tickets = ((data.issues ?? []) as Record<string, unknown>[]).map(parseJiraTicket);
    return { sprintName: (sprint.name as string) ?? "Active Sprint", tickets };
  }

  const data = await searchIssues(
    `project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`,
    40
  );
  const tickets = ((data.issues ?? []) as Record<string, unknown>[]).map(parseJiraTicket);
  return { sprintName: "Board (no active sprint)", tickets };
}

async function fetchJiraAttention(
  tickets: JiraTicket[],
  myName: string
): Promise<string[]> {
  const attention: string[] = [];
  const candidates = tickets.filter((t) => {
    const blocked = /block/i.test(t.status);
    const mine = t.assignee === myName;
    const unassigned = t.assignee === "Unassigned";
    const stale = daysSince(t.updated) > 5 && t.statusCategory !== "Done";
    return blocked || mine || unassigned || stale;
  });

  for (const t of candidates.slice(0, 10)) {
    const blocked = /block/i.test(t.status);
    const unassigned = t.assignee === "Unassigned";
    const stale = daysSince(t.updated) > 7 && t.statusCategory === "In Progress";

    if (blocked) attention.push(`${t.key} is BLOCKED (${t.status})`);
    if (unassigned && /high|highest|critical/i.test(t.priority)) {
      attention.push(`${t.key} is unassigned with ${t.priority} priority`);
    }
    if (stale && t.assignee === myName) {
      attention.push(`${t.key} in progress but stale (${Math.floor(daysSince(t.updated))}d since update)`);
    }

    const { comments } = await getIssueComments(t.key, 3);
    const parsed = (comments ?? []).map((c) => {
      const author = ((c.author as Record<string, unknown>)?.displayName as string) ?? "Someone";
      const body = extractAdfText(c.body).replace(/\s+/g, " ").trim();
      return { author, body, created: c.created as string };
    });
    const snippet = recentCommentSnippet(parsed, myName);
    if (snippet && (t.assignee === myName || blocked)) {
      attention.push(`${t.key} comment needs look: ${snippet}`);
    }
  }

  return [...new Set(attention)].slice(0, 6);
}

async function fetchGitHubAttention(
  login: string,
  issues: GitHubIssue[],
  prs: GitHubPR[]
): Promise<string[]> {
  const attention: string[] = [];

  for (const pr of prs) {
    const isMine = pr.user?.login === login;
    const wantsMyReview = pr.requested_reviewers?.some((r) => r.login === login);
    const stale = daysSince(pr.updated_at) > 7;

    if (wantsMyReview) attention.push(`PR #${pr.number} waiting on your review`);
    if (isMine && pr.draft) attention.push(`PR #${pr.number} still in draft`);
    if (isMine && stale) attention.push(`PR #${pr.number} stale (${Math.floor(daysSince(pr.updated_at))}d)`);

    if (isMine || wantsMyReview) {
      const [issueComments, reviewComments] = await Promise.all([
        listIssueComments(pr.number),
        listPullReviewComments(pr.number),
      ]);
      const all: GitHubComment[] = [...issueComments, ...reviewComments];
      const parsed = all.map((c) => ({
        author: c.user?.login ?? "unknown",
        body: (c.body ?? "").replace(/\s+/g, " ").slice(0, 120),
        created: c.created_at,
      }));
      const snippet = recentCommentSnippet(parsed, login);
      if (snippet) attention.push(`PR #${pr.number}: ${snippet}`);
    }
  }

  for (const issue of issues) {
    const assigned = issue.assignees?.some((a) => a.login === login);
    if (!assigned) continue;
    if (issue.comments > 0) {
      const comments = await listIssueComments(issue.number);
      const parsed = comments.map((c) => ({
        author: c.user?.login ?? "unknown",
        body: (c.body ?? "").replace(/\s+/g, " ").slice(0, 120),
        created: c.created_at,
      }));
      const snippet = recentCommentSnippet(parsed, login);
      if (snippet) attention.push(`Issue #${issue.number}: ${snippet}`);
    }
  }

  return [...new Set(attention)].slice(0, 6);
}

export async function gatherBriefingContext(): Promise<BriefingContext> {
  const boardId = process.env.JIRA_BOARD_ID;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  const githubLogin = process.env.GITHUB_OWNER ?? "";

  let jiraName = process.env.PULSE_USER_NAME ?? "";
  if (!jiraName && boardId) {
    try {
      const me = await getCurrentUser();
      jiraName = me.displayName ?? "";
    } catch {
      jiraName = "";
    }
  }

  const [jiraBundle, issues, prs, commits] = await Promise.all([
    boardId && projectKey
      ? fetchJiraTickets(boardId, projectKey).catch(() => ({
          sprintName: "Jira unavailable",
          tickets: [] as JiraTicket[],
        }))
      : Promise.resolve({ sprintName: "Jira not configured", tickets: [] as JiraTicket[] }),
    listOpenIssues().catch(() => [] as GitHubIssue[]),
    listOpenPullRequests().catch(() => [] as GitHubPR[]),
    listRecentCommits(12).catch(() => [] as GitHubCommit[]),
  ]);

  const { sprintName, tickets } = jiraBundle;
  const crossRefs = findCrossRefs(tickets, issues, prs, commits);

  const myJiraActive = tickets
    .filter((t) => t.assignee === jiraName && t.statusCategory === "In Progress")
    .map((t) => `${t.key}: ${t.summary}`);
  const myJiraUpcoming = tickets
    .filter(
      (t) =>
        t.assignee === jiraName &&
        (t.statusCategory === "To Do" || /to do|backlog|ready/i.test(t.status))
    )
    .slice(0, 6)
    .map((t) => `${t.key}: ${t.summary} (${t.status})`);

  const sprintQueue = tickets
    .filter(
      (t) =>
        t.statusCategory === "To Do" || /backlog|ready|selected/i.test(t.status)
    )
    .slice(0, 8)
    .map((t) => `${t.key}: ${t.summary} [${t.assignee}]`);

  const inProgress = tickets.filter((t) => t.statusCategory === "In Progress").length;
  const todo = tickets.filter((t) => t.statusCategory === "To Do").length;
  const blocked = tickets.filter((t) => /block/i.test(t.status)).length;
  const unassigned = tickets.filter((t) => t.assignee === "Unassigned").length;

  const myCommits = commits
    .filter((c) => c.author?.login === githubLogin)
    .slice(0, 5)
    .map((c) => c.commit.message.split("\n")[0]);
  const myPrs = prs
    .filter((p) => p.user?.login === githubLogin)
    .map((p) => `#${p.number} ${p.title}${p.draft ? " (draft)" : ""}`);
  const myIssues = issues
    .filter((i) => i.assignees?.some((a) => a.login === githubLogin))
    .map((i) => `#${i.number} ${i.title}`);

  const [jiraAttention, githubAttention] = await Promise.all([
    fetchJiraAttention(tickets, jiraName),
    fetchGitHubAttention(githubLogin, issues, prs),
  ]);

  return {
    user: { jiraName: jiraName || "You", githubLogin },
    jira: {
      sprintName,
      activeWork: myJiraActive.length ? myJiraActive : ["Nothing in progress assigned to you"],
      upcoming: myJiraUpcoming.length
        ? myJiraUpcoming
        : ["No upcoming To Do items assigned — check backlog for next picks"],
      sprintQueue: sprintQueue.length
        ? sprintQueue
        : ["No queued To Do / backlog items on the board"],
      teamPulse: `${tickets.length} sprint/board tickets — ${inProgress} in progress, ${todo} to do, ${blocked} blocked, ${unassigned} unassigned`,
      attention: jiraAttention,
    },
    github: {
      activeWork: [
        ...(myPrs.length ? [`PRs: ${myPrs.join("; ")}`] : []),
        ...(myIssues.length ? [`Issues: ${myIssues.join("; ")}`] : []),
        ...(myCommits.length ? [`Recent commits: ${myCommits.join("; ")}`] : []),
      ],
      activitySummary: `${prs.length} open PRs, ${issues.length} open issues, ${commits.length} recent commits on repo`,
      attention: githubAttention,
    },
    crossRefs,
  };
}

export function formatBriefingContext(ctx: BriefingContext): string {
  return [
    `USER: Jira="${ctx.user.jiraName}" GitHub="${ctx.user.githubLogin}"`,
    "",
    `JIRA (${ctx.jira.sprintName})`,
    `Team: ${ctx.jira.teamPulse}`,
    `Your active: ${ctx.jira.activeWork.join(" | ")}`,
    `Your upcoming: ${ctx.jira.upcoming.join(" | ")}`,
    `Sprint queue (next up on board): ${ctx.jira.sprintQueue.join(" | ")}`,
    ctx.jira.attention.length
      ? `Jira needs attention:\n${ctx.jira.attention.map((a) => `- ${a}`).join("\n")}`
      : "Jira needs attention: none flagged",
    "",
    "GITHUB",
    ctx.github.activitySummary,
    ctx.github.activeWork.length
      ? `Your GitHub work: ${ctx.github.activeWork.join(" | ")}`
      : "Your GitHub work: no open PRs/issues/commits attributed to you recently",
    ctx.github.attention.length
      ? `GitHub needs attention:\n${ctx.github.attention.map((a) => `- ${a}`).join("\n")}`
      : "GitHub needs attention: none flagged",
    "",
    ctx.crossRefs.length
      ? `JIRA ↔ GITHUB OVERLAP:\n${ctx.crossRefs.map((r) => `- ${r}`).join("\n")}`
      : "JIRA ↔ GITHUB OVERLAP: none detected",
  ].join("\n");
}
