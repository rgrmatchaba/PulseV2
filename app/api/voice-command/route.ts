import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createAtlassianMCPClient, createGitHubMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";
import { createGroqChatCompletion, toolCallingSystemMessage } from "@/lib/groq-tool-chat";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

type Route = "jira" | "github" | "irrelevant" | "clarify";
interface RouterResult { route: Route; question?: string }
type ContextMessage = { role: "user" | "assistant"; content: string };

// ── Layer 1: Intent Router (fast light model) ─────────────────────────────────

async function routeIntent(
  transcript: string,
  context: ContextMessage[]
): Promise<RouterResult> {
  const res = await groq.chat.completions.create({
    model: "qwen/qwen3-32b",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are an intent router for Pulse, a developer co-pilot that controls Jira and GitHub.

Classify the user's request as exactly one of:
- "jira"      → Jira tickets, sprints, issues, boards, comments, transitions, priorities
- "github"    → GitHub repos, pull requests, commits, branches, code search, GitHub issues
- "irrelevant"→ anything NOT related to Jira or GitHub (weather, food, general chat, etc.)
- "clarify"   → genuinely ambiguous between Jira and GitHub — ask one focused question

Use the prior conversation context (if any) to help resolve ambiguous follow-ups.

Reply with ONLY valid JSON, no extra text:
{"route":"jira"|"github"|"irrelevant"|"clarify","question":"your question here — only set if route=clarify"}`,
      },
      ...context.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: transcript },
    ],
  });

  try {
    let text = (res.choices[0].message.content ?? "{}").trim();
    // Qwen3 prepends <think>...</think> reasoning blocks — strip them before parsing
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // Strip markdown fences
    text = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    // Extract the first JSON object in case the model adds surrounding prose
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] ?? text) as RouterResult;
  } catch {
    return { route: "clarify", question: "Can you clarify — is this about Jira or GitHub?" };
  }
}

const FRUSTRATED = [
  "Man, what the hell are you talking about? I deal with Jira and GitHub. That's the whole menu. Pick one.",
  "That ain't got a damn thing to do with your sprint or your repo. Ask me something I can actually use.",
  "Are you serious right now? I'm a developer co-pilot. Jira. GitHub. That's it. That's the list.",
  "I don't know what you're on about, but it sure ain't a ticket or a pull request. Stay in your lane.",
  "Wrong tool, wrong question. I do Jira and GitHub. Come back when you've got something relevant.",
  "English, do you speak it?! Because what you just said has nothing to do with code, tickets, or repos.",
  "I'm gonna need you to take that question, walk it over to Google, and leave me alone. I do Jira and GitHub.",
  "Oh hell no. You did not just ask me that. I am a developer co-pilot, not your therapist. Jira. GitHub. That's my world.",
  "Look, I like you. But that question? That question is dead to me. Come back with a ticket number or a repo.",
  "You know what? I've been through too much to deal with this. Ask me about a sprint, a PR, anything. Just not... that.",
  "My name is Pulse. I live in the terminal. I breathe YAML. I don't do whatever this is. Try again.",
  "I am very serious about Jira and GitHub, and I will not stand here and be disrespected with off-topic questions.",
  "Does this look like Stack Overflow to you? Does this look like ChatGPT? Ask me about your tickets. NOW.",
  "Zero. That's how many damns I give about that question. Jira or GitHub — those are your two options, friend.",
  "You better check yourself before you wreck yourself — and by wreck, I mean waste both our time again with that nonsense.",
];

function frustrated(): string {
  return FRUSTRATED[Math.floor(Math.random() * FRUSTRATED.length)];
}

// ── Schema helpers ────────────────────────────────────────────────────────────

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

// ── Layer 2a: Jira executor ───────────────────────────────────────────────────

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

async function executeJira(transcript: string): Promise<string> {
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

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    toolCallingSystemMessage(),
    {
      role: "system",
      content: `You are Pulse, a voice-powered Jira executor with the directness of Samuel L. Jackson.
Jira project key: ${process.env.JIRA_PROJECT_KEY} | Board ID: ${process.env.JIRA_BOARD_ID}
- Call the appropriate Jira tool to fulfil the request
- If transitioning an issue, first call jira_get_transitions to get valid transition IDs
- Respond in 1-2 sentences confirming what you did or found. Keep the SLJ energy.`,
    },
    { role: "user", content: transcript },
  ];

  try {
    while (true) {
      const response = await createGroqChatCompletion(groq, {
        model: "qwen/qwen3-32b",
        messages,
        tools: groqTools,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
        await client.close();
        return choice.message.content ?? "Done.";
      }

      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args = typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch { args = {}; }

        if (toolCall.function.name === "jira_search")
          args.limit = Math.min(parseInt(String(args.limit || 10), 10) || 10, 50);
        if (toolCall.function.name === "jira_get_sprint_issues")
          args.limit = Math.min(parseInt(String(args.limit || 15), 10) || 15, 50);
        if (toolCall.function.name === "jira_get_sprints_from_board" && args.board_id !== undefined)
          args.board_id = String(args.board_id);

        const result = await executeMCPTool(client, toolCall.function.name, args);
        const truncated = result.length > 8000 ? result.slice(0, 8000) + "\n...[truncated]" : result;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: truncated });
      }
    }
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

// ── Layer 2b: GitHub executor ─────────────────────────────────────────────────

const GITHUB_ALLOWED = [
  "list_issues",
  "issue_read",
  "issue_write",
  "list_pull_requests",
  "pull_request_read",
  "add_issue_comment",        // also handles PR comments — pass PR number as issue_number
  "add_reply_to_pull_request_comment",
  "list_commits",
  "get_commit",
  "list_branches",
  "get_file_contents",
  "search_code",
  "search_repositories",
  "search_pull_requests",
];

async function executeGithub(transcript: string): Promise<string> {
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

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    toolCallingSystemMessage(),
    {
      role: "system",
      content: `You are Pulse, a voice-powered GitHub executor with the directness of Samuel L. Jackson.
Default repo: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}
- Call the appropriate GitHub tool to fulfil the request
- Respond in 1-2 sentences confirming what you found or did. Keep the SLJ energy.`,
    },
    { role: "user", content: transcript },
  ];

  try {
    while (true) {
      const response = await createGroqChatCompletion(groq, {
        model: "qwen/qwen3-32b",
        messages,
        tools: groqTools,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
        await client.close();
        return choice.message.content ?? "Done.";
      }

      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args = typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch { args = {}; }

        const result = await executeMCPTool(client, toolCall.function.name, args);
        const truncated = result.length > 8000 ? result.slice(0, 8000) + "\n...[truncated]" : result;
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: truncated });
      }
    }
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let transcript: string;
  let context: ContextMessage[] = [];

  try {
    const body = await req.json();
    transcript = body.transcript;
    context = Array.isArray(body.context) ? body.context : [];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
  }

  // Layer 1 — route intent
  let routing: RouterResult;
  try {
    routing = await routeIntent(transcript, context);
  } catch (err) {
    console.error("router error:", err);
    return NextResponse.json({ reply: "My brain just glitched on that one. Give it to me again.", route: "error" });
  }

  if (routing.route === "irrelevant") {
    return NextResponse.json({ reply: frustrated(), route: "irrelevant" });
  }

  if (routing.route === "clarify") {
    return NextResponse.json({
      reply: routing.question ?? "Hold up — is this about Jira or GitHub? I need you to be specific.",
      route: "clarify",
    });
  }

  // Layer 2 — execute against the correct MCP
  try {
    const reply = routing.route === "github"
      ? await executeGithub(transcript)
      : await executeJira(transcript);
    return NextResponse.json({ reply, route: routing.route });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("voice-command error:", message);
    return NextResponse.json({ reply: `That command went sideways on me: ${message}. Try again.`, route: "error" });
  }
}
