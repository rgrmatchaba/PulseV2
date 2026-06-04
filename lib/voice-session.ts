import {
  isInternalNarration,
  isOnlyIdentifierUtterance,
  isTransitionConfirmed,
  parseJiraTransitionIntent,
  userWantsJiraComment,
  type VoiceContextMessage,
} from "./task-requirements";

export type { VoiceContextMessage };
export type SessionRoute = "jira" | "github" | "both" | null;

const MAX_CONTEXT_TURNS = 10;

export function trimVoiceContext(
  context: VoiceContextMessage[]
): VoiceContextMessage[] {
  return context.slice(-MAX_CONTEXT_TURNS);
}

/** User must answer before we can execute — keep session alive. */
export function isAwaitingUserInput(reply: string): boolean {
  const r = reply.trim();
  if (!r) return true;
  if (
    /^(done|completed|finished|all set|got it|mission complete|that's handled)/i.test(
      r
    )
  ) {
    return false;
  }
  if (r.endsWith("?")) return true;
  if (
    /\b(which|what|who|where|when|how many)\b.*\b(ticket|issue|pr|pull request|comment|sprint|board)\b/i.test(
      r
    )
  ) {
    return true;
  }
  if (
    /\b(need you to|tell me|let me know|clarify|hold up|wait|before i can|missing)\b/i.test(
      r
    )
  ) {
    return true;
  }
  return false;
}

/** Task not done — e.g. user replied with only a PR number when comment was still needed. */
export function taskStillNeedsUserInput(
  reply: string,
  context: VoiceContextMessage[],
  transcript: string
): boolean {
  if (isAwaitingUserInput(reply)) return true;

  const history = context.map((m) => m.content).join(" ");
  const commentTask =
    userWantsJiraComment(history) ||
    userWantsJiraComment(transcript) ||
    (/comment|add.*(pr|pull request)|post.*(on|to)/i.test(history) &&
      !/move|transition|to\s+done/i.test(history));

  if (commentTask && isOnlyIdentifierUtterance(transcript)) {
    return true;
  }

  if (
    /exact comment|what.*comment|comment text|words should i post/i.test(
      reply.toLowerCase()
    )
  ) {
    return true;
  }

  const transition = parseJiraTransitionIntent(
    context,
    transcript,
    process.env.JIRA_PROJECT_KEY
  );
  if (transition) {
    if (isInternalNarration(reply)) return true;
    if (!isTransitionConfirmed(reply, transition.issueKey)) return true;
  }

  return false;
}

export function inferSessionRoute(
  context: VoiceContextMessage[],
  sessionRoute: SessionRoute
): SessionRoute {
  if (sessionRoute) return sessionRoute;

  const blob = context.map((m) => m.content).join(" ").toLowerCase();
  const hasJira = /jira|ticket|sprint|pwp-|board/.test(blob);
  const hasGitHub = /github|pull request|\bpr\b|commit|repo/.test(blob);
  if (hasJira && hasGitHub) return "both";
  if (hasGitHub) return "github";
  if (hasJira) return "jira";
  return null;
}

export const PULSE_MULTI_TURN_RULES = `Multi-turn task execution:
- Read the FULL conversation — identify the original goal and what is still missing.
- Think step by step internally, but only SPEAK the final user-facing reply (no thinking tags).
- Status transitions: need ticket (key or clear description) and target status — NO comment required unless the user asked for one.
- For adding comments: you need BOTH the target (PR/issue number or key) AND the exact comment words from the user. If you only have a number, ask for the comment — NEVER invent comment text.
- If ANY critical detail is missing (ticket key, PR number, exact comment text), ask exactly ONE short question and stop — do NOT call write/comment tools yet.
- NEVER fabricate, paraphrase, or guess comment bodies — only use words the user actually said.
- If you have ALL required information, call tools and COMPLETE the task in this turn.
- After tools succeed, give clear completion feedback — do not ask more unless something failed.
- Do not re-ask for information the user already gave in the conversation.`;
