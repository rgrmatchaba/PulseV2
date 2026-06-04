import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createAtlassianMCPClient, createGitHubMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";
import { pulseToolAgentSystemMessages } from "@/lib/groq-tool-chat";
import {
  PULSE_SLJ_ERRORS,
  pulseGitHubExecutorSystem,
  pulseJiraExecutorSystem,
} from "@/lib/pulse-persona";
import { sanitizeSpokenReply, stripModelThinking } from "@/lib/spoken-reply";
import { executeJiraComment, executeJiraTransition } from "@/lib/jira-voice-actions";
import { executeCrossPlatformSummary } from "@/lib/voice-cross-platform";
import {
  buildTransitionBlob,
  extractJiraIssueKey,
  extractTicketDescriptionHint,
  looksLikeJiraTransitionRequest,
  userWantsJiraComment,
  validateGithubMutatingTool,
  validateJiraMutatingTool,
} from "@/lib/task-requirements";
import {
  inferSessionRoute,
  taskStillNeedsUserInput,
  trimVoiceContext,
  type SessionRoute,
  type VoiceContextMessage,
} from "@/lib/voice-session";
import { runVoiceToolAgent } from "@/lib/voice-tool-agent";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type Route = "jira" | "github" | "both" | "irrelevant" | "clarify";
interface RouterResult { route: Route; question?: string }

function wantsCrossPlatform(transcript: string): boolean {
  if (looksLikeJiraTransitionRequest(transcript)) return false;

  const t = transcript.toLowerCase();
  const hasJira = /jira|ticket|sprint|board|pwp-/i.test(t);
  const hasGitHub = /github|pull request|\bpr\b|commit|repo/i.test(t);
  if (hasJira && hasGitHub) return true;

  const wantsSummary =
    /summary|overview|standup|briefing|what.+going on|how.+relate|align/i.test(t);
  return wantsSummary && hasJira && hasGitHub;
}

function buildExecutorMessages(
  system: ReturnType<typeof pulseToolAgentSystemMessages>,
  context: VoiceContextMessage[],
  transcript: string
): Groq.Chat.ChatCompletionMessageParam[] {
  const history = trimVoiceContext(context).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  return [...system, ...history, { role: "user", content: transcript }];
}

async function routeContinuation(
  transcript: string,
  context: VoiceContextMessage[],
  sessionRoute: SessionRoute
): Promise<RouterResult> {
  const inferred = inferSessionRoute(context, sessionRoute);
  if (inferred) return { route: inferred };

  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Continue an in-progress Pulse voice task. Pick the route for THIS user reply:
- "jira" | "github" | "both" | "irrelevant"
Do NOT output "clarify" — the executor will ask questions if needed.

Reply ONLY JSON: {"route":"jira"|"github"|"both"|"irrelevant"}`,
      },
      ...trimVoiceContext(context).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: transcript },
    ],
  });

  try {
    let text = stripModelThinking(res.choices[0].message.content ?? "{}");
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? text) as { route: Route };
    if (parsed.route === "jira" || parsed.route === "github" || parsed.route === "both") {
      return { route: parsed.route };
    }
  } catch {
    /* fall through */
  }
  return { route: "jira" };
}

async function routeIntent(
  transcript: string,
  context: VoiceContextMessage[],
  sessionRoute: SessionRoute
): Promise<RouterResult> {
  if (context.length > 0) {
    return routeContinuation(transcript, context, sessionRoute);
  }

  const jiraOnlyAction =
    (looksLikeJiraTransitionRequest(transcript) || userWantsJiraComment(transcript)) &&
    !/github|pull request|\bpr\b|commit|repo/i.test(transcript.toLowerCase());
  if (jiraOnlyAction) {
    return { route: "jira" };
  }

  if (wantsCrossPlatform(transcript)) {
    return { route: "both" };
  }

  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an intent router for Pulse, a developer co-pilot for Jira and GitHub.

Classify the user's request as exactly one of:
- "both"      → needs Jira AND GitHub together: summary, overview, status, standup, how tickets relate to PRs/commits
- "jira"      → Jira-only: tickets, sprints, boards, transitions, comments
- "github"    → GitHub-only: PRs, commits, branches, repo issues
- "irrelevant"→ NOT about Jira or GitHub
- "clarify"   → ONLY if truly one platform and ambiguous — NOT when user wants both or a combined summary

If the user mentions Jira and GitHub in one request, route "both".

Reply with ONLY valid JSON:
{"route":"jira"|"github"|"both"|"irrelevant"|"clarify","question":"only if clarify"}`,
      },
      { role: "user", content: transcript },
    ],
  });

  try {
    let text = stripModelThinking(res.choices[0].message.content ?? "{}");
    text = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? text) as RouterResult;
    if (parsed.route === "clarify" && wantsCrossPlatform(transcript)) {
      return { route: "both" };
    }
    return parsed;
  } catch {
    return wantsCrossPlatform(transcript)
      ? { route: "both" }
      : { route: "clarify", question: PULSE_SLJ_ERRORS.clarifyDefault };
  }
}

const FRUSTRATED = [
  "Man, what the hell are you talking about? I deal with Jira and GitHub. That's the whole menu. Pick one.",
  "That ain't got a damn thing to do with your sprint or your repo. Ask me something I can actually use.",
];

function frustrated(): string {
  return FRUSTRATED[Math.floor(Math.random() * FRUSTRATED.length)];
}

function trimSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const props = raw.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return raw;
  const trimmed: Record<string, Record<string, unknown>> = {};
  for (const [key, def] of Object.entries(props)) {
    const { description: _d, examples: _e, default: _df, ...rest } = def;
    trimmed[key] = rest;
  }
  return { ...raw, properties: trimmed };
}

function jsonResponse(
  reply: string,
  route: Route | "error",
  taskActive: boolean,
  sessionRoute: SessionRoute
) {
  return NextResponse.json({
    reply: sanitizeSpokenReply(reply, {
      maxChars: route === "both" ? 400 : taskActive ? 160 : 280,
    }),
    route,
    taskActive,
    sessionRoute: taskActive ? sessionRoute : null,
  });
}

const JIRA_ALLOWED = [
  "jira_get_issue",
  "jira_transition_issue",
  "jira_add_comment",
  "jira_update_issue",
  "jira_get_transitions",
  "jira_search",
  "jira_get_sprint_issues",
  "jira_get_sprints_from_board",
];
const LIMIT_INJECTED = new Set(["jira_search", "jira_get_sprint_issues"]);

async function executeJira(
  transcript: string,
  context: VoiceContextMessage[]
): Promise<{ reply: string; taskActive: boolean }> {
  const projectKey = process.env.JIRA_PROJECT_KEY ?? "";
  const boardId = process.env.JIRA_BOARD_ID ?? "";
  const blob = buildTransitionBlob(context, transcript);
  const transitionOnly =
    looksLikeJiraTransitionRequest(blob) && !userWantsJiraComment(blob);

  // Jira mutations via REST — Atlassian MCP no longer exposes jira_* tools on this site.
  const transitionResult = await executeJiraTransition(
    context,
    transcript,
    projectKey,
    boardId
  );
  if (transitionResult) return transitionResult;

  if (transitionOnly) {
    const hint = extractTicketDescriptionHint(blob);
    return {
      reply: hint
        ? `Couldn't match that ticket in the sprint. Say the key — like PWP dash 1.`
        : `I heard you want to move a ticket — which issue key? Say PWP dash 1 or PWP-1.`,
      taskActive: true,
    };
  }

  const commentResult = await executeJiraComment(context, transcript, projectKey);
  if (commentResult) return commentResult;

  const client = await createAtlassianMCPClient();
  const { tools: mcpTools } = await client.listTools();

  const groqTools = mcpTools
    .filter((t) => JIRA_ALLOWED.includes(t.name))
    .map((tool) => {
      let schema = trimSchema(tool.inputSchema as Record<string, unknown>);
      if (LIMIT_INJECTED.has(tool.name)) {
        const props = { ...(schema.properties as Record<string, unknown> ?? {}) };
        delete props.limit;
        schema = {
          ...schema,
          properties: props,
          required: (schema.required as string[] ?? []).filter((f) => f !== "limit"),
        };
      }
      return {
        type: "function" as const,
        function: { name: tool.name, description: tool.description ?? "", parameters: schema },
      };
    });

  if (groqTools.length === 0) {
    await client.close().catch(() => {});
    console.warn(
      "[Pulse] No jira_* MCP tools available — only Teamwork Graph tools. Use REST for transitions/comments."
    );
    const blob = [...context, { role: "user", content: transcript }]
      .map((m) => m.content)
      .join(" ");
    if (looksLikeJiraTransitionRequest(blob)) {
      const key = extractJiraIssueKey(blob, projectKey);
      if (!key) {
        return {
          reply:
            "I heard you want to move a ticket — which issue key? Say PWP dash 4 or PWP-4.",
          taskActive: true,
        };
      }
      return {
        reply: `I got ${key} but couldn't run the transition — try again: move ${key} to done.`,
        taskActive: true,
      };
    }
    return {
      reply:
        "I can transition tickets and add comments on Jira — say something like move PWP-4 to done, or add a comment on PWP-4. General Jira search on the dashboard already uses the API.",
      taskActive: false,
    };
  }

  const messages = buildExecutorMessages(
    pulseToolAgentSystemMessages(
      pulseJiraExecutorSystem(projectKey, process.env.JIRA_BOARD_ID ?? "")
    ),
    context,
    transcript
  );

  const { reply } = await runVoiceToolAgent(
    groq,
    messages,
    groqTools,
    async (name, args) => {
      if (name === "jira_search")
        args.limit = Math.min(parseInt(String(args.limit || 10), 10) || 10, 50);
      if (name === "jira_get_sprint_issues")
        args.limit = Math.min(parseInt(String(args.limit || 15), 10) || 15, 50);
      if (name === "jira_get_sprints_from_board" && args.board_id !== undefined)
        args.board_id = String(args.board_id);
      return executeMCPTool(client, name, args);
    },
    () => client.close().catch(() => {}),
    320,
    (name, args) => validateJiraMutatingTool(name, args, context, transcript)
  );

  return {
    reply,
    taskActive: taskStillNeedsUserInput(reply, context, transcript),
  };
}

const GITHUB_ALLOWED = [
  "list_issues",
  "issue_read",
  "issue_write",
  "list_pull_requests",
  "pull_request_read",
  "add_issue_comment",
  "add_reply_to_pull_request_comment",
  "list_commits",
  "get_commit",
  "list_branches",
  "get_file_contents",
  "search_code",
  "search_repositories",
  "search_pull_requests",
];

async function executeGithub(
  transcript: string,
  context: VoiceContextMessage[]
): Promise<{ reply: string; taskActive: boolean }> {
  const client = await createGitHubMCPClient();
  const { tools: mcpTools } = await client.listTools();

  const groqTools = mcpTools
    .filter((t) => GITHUB_ALLOWED.includes(t.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: trimSchema(tool.inputSchema as Record<string, unknown>),
      },
    }));

  const messages = buildExecutorMessages(
    pulseToolAgentSystemMessages(
      pulseGitHubExecutorSystem(
        process.env.GITHUB_OWNER ?? "",
        process.env.GITHUB_REPO ?? ""
      )
    ),
    context,
    transcript
  );

  const { reply } = await runVoiceToolAgent(
    groq,
    messages,
    groqTools,
    (name, args) => executeMCPTool(client, name, args),
    () => client.close().catch(() => {}),
    320,
    (name, args) => validateGithubMutatingTool(name, args, context, transcript)
  );

  return {
    reply,
    taskActive: taskStillNeedsUserInput(reply, context, transcript),
  };
}

export async function POST(req: NextRequest) {
  let transcript: string;
  let context: VoiceContextMessage[] = [];
  let sessionRoute: SessionRoute = null;

  try {
    const body = await req.json();
    transcript = body.transcript;
    context = Array.isArray(body.context) ? body.context : [];
    sessionRoute = body.sessionRoute ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  context = trimVoiceContext(context);

  let routing: RouterResult;
  try {
    routing = await routeIntent(transcript, context, sessionRoute);
  } catch (err) {
    console.error("router error:", err);
    return jsonResponse(PULSE_SLJ_ERRORS.routerGlitch, "error", false, null);
  }

  if (routing.route === "irrelevant") {
    return jsonResponse(frustrated(), "irrelevant", false, null);
  }

  const activeSessionRoute: SessionRoute =
    routing.route === "jira" || routing.route === "github" || routing.route === "both"
      ? routing.route
      : inferSessionRoute(context, sessionRoute);

  if (routing.route === "clarify") {
    const question = routing.question ?? PULSE_SLJ_ERRORS.clarifyDefault;
    return jsonResponse(question, "clarify", true, activeSessionRoute ?? "jira");
  }

  try {
    if (routing.route === "both") {
      const rawReply = await executeCrossPlatformSummary(transcript, context);
      const taskActive = taskStillNeedsUserInput(rawReply, context, transcript);
      return jsonResponse(rawReply, "both", taskActive, taskActive ? "both" : null);
    }

    if (routing.route === "github") {
      const { reply, taskActive } = await executeGithub(transcript, context);
      return jsonResponse(reply, "github", taskActive, taskActive ? "github" : null);
    }

    const { reply, taskActive } = await executeJira(transcript, context);
    return jsonResponse(reply, "jira", taskActive, taskActive ? "jira" : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("voice-command error:", message);
    return jsonResponse(PULSE_SLJ_ERRORS.commandFailed(message), "error", false, null);
  }
}
