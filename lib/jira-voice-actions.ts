import { addIssueComment, transitionIssueToStatus } from "./jira-api";
import { findIssueKeyBySummaryHint } from "./jira-issue-resolve";
import {
  buildTransitionBlob,
  extractJiraIssueKey,
  extractTicketDescriptionHint,
  looksLikeJiraTransitionRequest,
  parseJiraTransitionIntent,
  parseTransitionTargetStatus,
  userProvidedCommentBody,
  userWantsJiraComment,
  type JiraTransitionIntent,
  type VoiceContextMessage,
} from "./task-requirements";

async function resolveTransitionIntent(
  context: VoiceContextMessage[],
  transcript: string,
  projectKey: string,
  boardId: string
): Promise<
  | { intent: JiraTransitionIntent }
  | { error: string; taskActive: boolean }
  | null
> {
  const direct = parseJiraTransitionIntent(context, transcript, projectKey);
  if (direct) return { intent: direct };

  const blob = buildTransitionBlob(context, transcript);
  if (!looksLikeJiraTransitionRequest(blob)) return null;

  const hint = extractTicketDescriptionHint(blob);
  if (!hint) return null;

  const targetStatus = parseTransitionTargetStatus(blob);
  const resolved = await findIssueKeyBySummaryHint(hint, projectKey, boardId);

  if (resolved.kind === "match") {
    console.log(
      `[Pulse] Resolved ticket by description: ${resolved.key} (${resolved.summary})`
    );
    return { intent: { issueKey: resolved.key, targetStatus } };
  }

  if (resolved.kind === "ambiguous") {
    const list = resolved.options
      .map((o) => `${o.key} (${o.summary.slice(0, 40)})`)
      .join(", or ");
    return {
      error: `A few tickets match — which one? ${list}.`,
      taskActive: true,
    };
  }

  return {
    error: `No ticket matched "${hint}". Say the key like PWP dash 1.`,
    taskActive: true,
  };
}

/** Run transition via Jira REST (MCP jira_* tools are not available on this site). */
export async function executeJiraTransition(
  context: VoiceContextMessage[],
  transcript: string,
  projectKey: string,
  boardId = ""
): Promise<{ reply: string; taskActive: boolean } | null> {
  const resolved = await resolveTransitionIntent(
    context,
    transcript,
    projectKey,
    boardId
  );
  if (!resolved) return null;
  if ("error" in resolved) {
    return { reply: resolved.error, taskActive: resolved.taskActive };
  }

  const { issueKey, targetStatus } = resolved.intent;

  try {
    const result = await transitionIssueToStatus(issueKey, targetStatus);
    if (result.success) {
      return {
        reply: `Done — ${result.detail}.`,
        taskActive: false,
      };
    }
    return {
      reply: `Could not move ${issueKey}: ${result.detail}. Tell me which status you want.`,
      taskActive: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Pulse] Jira REST transition error:", msg);
    return {
      reply: `Transition failed for ${issueKey}: ${msg}`,
      taskActive: true,
    };
  }
}

/** Add comment when we have issue key + user-provided body. */
export async function executeJiraComment(
  context: VoiceContextMessage[],
  transcript: string,
  projectKey: string
): Promise<{ reply: string; taskActive: boolean } | null> {
  const blob = [...context, { role: "user" as const, content: transcript }]
    .map((m) => m.content)
    .join(" ");

  if (!userWantsJiraComment(blob)) return null;

  const issueKey = extractJiraIssueKey(blob, projectKey);
  if (!issueKey) return null;

  const commentMatch = blob.match(
    /(?:comment|saying|text)(?:\s+is)?[:\s]+["']?([^"'\n]+?)["']?(?:\s+on|\s+to|$)/i
  );
  const commentFromParse = commentMatch?.[1]?.trim();
  const commentBody = commentFromParse ?? transcript.trim();

  if (!userProvidedCommentBody(commentBody, context, transcript)) {
    return {
      reply: `Got ${issueKey} — what exact comment should I post?`,
      taskActive: true,
    };
  }

  try {
    await addIssueComment(issueKey, commentBody);
    return {
      reply: `Done — posted your comment on ${issueKey}.`,
      taskActive: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { reply: `Comment failed on ${issueKey}: ${msg}`, taskActive: true };
  }
}
