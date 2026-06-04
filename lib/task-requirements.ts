export type VoiceContextMessage = { role: "user" | "assistant"; content: string };

export type ToolValidationResult =
  | { ok: true }
  | { ok: false; blockedMessage: string };

function allUserText(
  context: VoiceContextMessage[],
  transcript: string
): string {
  return [...context, { role: "user" as const, content: transcript }]
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

function lastUserMessage(
  context: VoiceContextMessage[],
  transcript: string
): string {
  return transcript.trim();
}

/** True when the utterance is only a PR/issue number, not comment content. */
export function isOnlyIdentifierUtterance(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    /^(?:pr|pull request|issue|ticket)?\s*#?\d+\s*$/i.test(t) ||
    /^number\s+\d+\s*$/i.test(t) ||
    /^\d+\s*$/.test(t)
  ) {
    return true;
  }
  return false;
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(
    a
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wb = new Set(
    b
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}

/**
 * Comment body must appear in user speech — never model-invented filler.
 */
export function userProvidedCommentBody(
  commentBody: string,
  context: VoiceContextMessage[],
  transcript: string
): boolean {
  const body = commentBody.trim();
  if (body.length < 3) return false;

  const last = lastUserMessage(context, transcript);
  if (isOnlyIdentifierUtterance(last)) return false;

  const users = allUserText(context, transcript).toLowerCase();
  const bodyLower = body.toLowerCase();

  if (users.includes(bodyLower)) return true;

  if (last.length >= 6 && wordOverlap(last, body) >= 0.45) return true;

  // Quoted in an earlier user turn
  const quoted = users.match(/(?:comment|saying|text)[:\s]+["']([^"']{3,})["']/i);
  if (quoted && bodyLower.includes(quoted[1].toLowerCase().slice(0, 20))) return true;

  return false;
}

function getCommentBodyFromArgs(args: Record<string, unknown>): string {
  const keys = ["body", "comment", "text", "message", "content"];
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function validateGithubMutatingTool(
  toolName: string,
  args: Record<string, unknown>,
  context: VoiceContextMessage[],
  transcript: string
): ToolValidationResult {
  if (
    toolName !== "add_issue_comment" &&
    toolName !== "add_reply_to_pull_request_comment"
  ) {
    return { ok: true };
  }

  const body = getCommentBodyFromArgs(args);
  const last = lastUserMessage(context, transcript);

  if (!body) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: No comment text provided. Do NOT retry this tool. Ask the user: What exact words should I put in that comment?",
    };
  }

  if (isOnlyIdentifierUtterance(last)) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: User only gave a PR/issue number, not comment text. Do NOT retry this tool. Ask the user: Got the number — now what exact comment do you want me to post?",
    };
  }

  if (!userProvidedCommentBody(body, context, transcript)) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: Comment text was not spoken by the user — you cannot invent it. Do NOT retry this tool. Ask the user to say the exact comment word for word.",
    };
  }

  return { ok: true };
}

export type JiraTransitionIntent = {
  issueKey: string;
  targetStatus: string;
};

const SPOKEN_NUMBERS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

/** Normalize STT quirks: "p w p dash four" → "pwp dash 4". */
export function normalizeSpokenJiraText(text: string): string {
  let t = text;
  for (const [word, digit] of Object.entries(SPOKEN_NUMBERS)) {
    t = t.replace(new RegExp(`\\b${word}\\b`, "gi"), digit);
  }
  // Letter-by-letter project keys before "dash" / "-" + number
  t = t.replace(
    /\b((?:[a-z]\s+){2,}[a-z])(?=\s*(?:dash|-)\s*\d)/gi,
    (m) => m.replace(/\s+/g, "")
  );
  t = t.replace(
    /\b((?:[a-z]\s+){2,}[a-z])(?=\s*(?:dash|-)\s*)/gi,
    (m) => m.replace(/\s+/g, "")
  );
  return t;
}

/** Parse spoken keys like "PWPDash4" or "p w p dash four" → PWP-4. */
export function extractJiraIssueKey(
  text: string,
  projectKey?: string
): string | null {
  const normalized = normalizeSpokenJiraText(text);

  const standard = normalized.match(/\b([A-Z][A-Z0-9]+-\d+)\b/i);
  if (standard) return standard[1].toUpperCase();

  const dash = normalized.match(/\b([A-Z]{2,})\s*dash\s*(\d+)\b/i);
  if (dash) return `${dash[1]}-${dash[2]}`.toUpperCase();

  const mashed = normalized.match(/\b([A-Z]{2,})Dash(\d+)\b/i);
  if (mashed) return `${mashed[1]}-${mashed[2]}`.toUpperCase();

  if (projectKey) {
    const re = new RegExp(`\\b(${projectKey})\\s*dash?\\s*(\\d+)`, "i");
    const proj = normalized.match(re);
    if (proj) return `${proj[1].toUpperCase()}-${proj[2]}`;
  }

  return null;
}

export function looksLikeJiraTransitionRequest(text: string): boolean {
  const blob = normalizeSpokenJiraText(text);
  return /(?:transition|move|remove.*(?:tick|ticket)|from\s+.*(?:to\s*do|in\s+progress)\s+(?:into|to)\s+.*done|from\s+.*in\s+progress\s+to\s+.*done|in\s+progress\s+to\s+(?:status\s+)?done|(?:into|to)\s+(?:status\s+)?done|mark.+(?:done|complete)|status\s+done|close(?:\s+out)?)/i.test(
    blob
  );
}

/** True only when the user explicitly asked to add a Jira comment. */
export function userWantsJiraComment(text: string): boolean {
  const blob = normalizeSpokenJiraText(text);
  if (!/\bcomment\b/i.test(blob) && !/\badd\b.*\b(note|message)\b/i.test(blob)) {
    return false;
  }
  if (looksLikeJiraTransitionRequest(blob) && !/\b(?:with|and)\s+(?:a\s+)?comment\b/i.test(blob)) {
    return false;
  }
  return true;
}

export function parseTransitionTargetStatus(blob: string): string {
  if (
    /(?:into|to)\s+(?:status\s+)?done|mark.*done|move.*done|status\s+done|close(?:\s+out)?/i.test(
      blob
    )
  ) {
    return "Done";
  }
  if (/to\s+(?:status\s+)?in\s+progress/i.test(blob)) return "In Progress";
  if (/to\s+(?:status\s+)?to\s*do/i.test(blob)) return "To Do";
  return "Done";
}

/** Spoken description when no issue key (e.g. "ticket about database migration"). */
export function extractTicketDescriptionHint(text: string): string | null {
  const normalized = normalizeSpokenJiraText(text);
  const patterns = [
    /(?:jira\s+)?ticket\s+(?:about|on|for|regarding|called)\s+(.+?)(?:\s+from\s+(?:status\s+)?)/i,
    /(?:move|transition)\s+(?:the\s+)?(?:jira\s+)?ticket\s+(?:about\s+)?(.+?)\s+from\s+(?:status\s+)?/i,
    /issue\s+(?:about|on|for)\s+(.+?)(?:\s+from\s+(?:status\s+)?)/i,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]) {
      return m[1]
        .replace(/\baerobic\b/gi, "rollback")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return null;
}

export function buildTransitionBlob(
  context: VoiceContextMessage[],
  transcript: string
): string {
  return normalizeSpokenJiraText(
    [...context, { role: "user", content: transcript }]
      .map((m) => m.content)
      .join(" ")
  );
}

export function parseJiraTransitionIntent(
  context: VoiceContextMessage[],
  transcript: string,
  projectKey?: string
): JiraTransitionIntent | null {
  const blob = buildTransitionBlob(context, transcript);

  if (!looksLikeJiraTransitionRequest(blob)) {
    return null;
  }

  const issueKey = extractJiraIssueKey(blob, projectKey);
  if (!issueKey) return null;

  return { issueKey, targetStatus: parseTransitionTargetStatus(blob) };
}

/** User-facing reply describes process, not outcome. */
export function isInternalNarration(reply: string): boolean {
  const r = reply.toLowerCase();
  return (
    /transition\s*id/.test(r) ||
    /\b(calling|call)\b.*\b(jira|tool)/.test(r) ||
    /\bi need to get\b/.test(r) ||
    /\bi am calling\b/.test(r) ||
    /\blet me (?:call|get|fetch)\b/.test(r) ||
    /\bvalid transition/.test(r) ||
    /\bso i am\b.*\b(call|getting)/.test(r) ||
    /\bfirst i need to\b/.test(r)
  );
}

export function isTransitionConfirmed(reply: string, issueKey: string): boolean {
  const r = reply.toLowerCase();
  const key = issueKey.toLowerCase();
  return (
    (r.includes(key) || r.includes("ticket")) &&
    /\b(done|moved|transitioned|closed|complete|marked)\b/.test(r) &&
    !isInternalNarration(reply)
  );
}

export function validateJiraMutatingTool(
  toolName: string,
  args: Record<string, unknown>,
  context: VoiceContextMessage[],
  transcript: string
): ToolValidationResult {
  if (toolName !== "jira_add_comment") return { ok: true };

  const body = getCommentBodyFromArgs(args);
  const last = lastUserMessage(context, transcript);

  if (!body) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: No comment text. Do NOT retry. Ask the user for the exact Jira comment.",
    };
  }

  if (isOnlyIdentifierUtterance(last)) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: User only gave a ticket id, not comment text. Ask for the exact comment.",
    };
  }

  if (!userProvidedCommentBody(body, context, transcript)) {
    return {
      ok: false,
      blockedMessage:
        "BLOCKED: Comment not from user speech. Ask them to say the exact comment.",
    };
  }

  return { ok: true };
}
