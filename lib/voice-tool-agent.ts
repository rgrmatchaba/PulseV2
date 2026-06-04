import Groq from "groq-sdk";
import { createGroqChatCompletion } from "./groq-tool-chat";
import {
  isInternalNarration,
  isTransitionConfirmed,
  type JiraTransitionIntent,
  type ToolValidationResult,
} from "./task-requirements";
import { sanitizeSpokenReply, stripModelThinking } from "./spoken-reply";

export const VOICE_AGENT_MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_ROUNDS = 12;
const MIN_COMPLETE_CHARS = 12;

const FINISH_NUDGE =
  "Finish now. Give your complete spoken answer to the user in 1–4 sentences. No reasoning, no thinking tags, no placeholders — only the final reply.";

export type VoiceToolAgentResult = {
  reply: string;
  usedTools: boolean;
  toolsCalled: string[];
};

export type ToolCallValidator = (
  name: string,
  args: Record<string, unknown>
) => ToolValidationResult;

export type VoiceAgentCompletion = {
  /** Must call these tools before speaking a final answer (e.g. jira_transition_issue). */
  requiredTools?: string[];
  /** When set, transition must be executed and confirmed in speech. */
  jiraTransition?: JiraTransitionIntent;
};

function buildTransitionNudge(intent: JiraTransitionIntent): string {
  return `INCOMPLETE: You must finish the transition for ${intent.issueKey} to ${intent.targetStatus}.
1) Call jira_get_transitions for ${intent.issueKey} if you have not already.
2) Call jira_transition_issue with the correct transition id for "${intent.targetStatus}".
Do NOT mention transition IDs or tools to the user.
Then reply in ONE short sentence only, e.g. "Done — ${intent.issueKey} is ${intent.targetStatus} now."`;
}

export async function runVoiceToolAgent(
  groq: Groq,
  messages: Groq.Chat.ChatCompletionMessageParam[],
  tools: Groq.Chat.ChatCompletionTool[],
  runTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  cleanup: () => Promise<void>,
  maxChars = 280,
  validateTool?: ToolCallValidator,
  completion?: VoiceAgentCompletion
): Promise<VoiceToolAgentResult> {
  let rounds = 0;
  let nudgedFinish = false;
  let nudgedTransition = false;
  let usedTools = false;
  const toolsCalled: string[] = [];

  try {
    while (rounds++ < MAX_TOOL_ROUNDS) {
      const response = await createGroqChatCompletion(groq, {
        model: VOICE_AGENT_MODEL,
        messages,
        tools,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      const content = stripModelThinking(choice.message.content ?? "");

      if (!choice.message.tool_calls?.length) {
        const missingRequired = (completion?.requiredTools ?? []).filter(
          (t) => !toolsCalled.includes(t)
        );
        const transitionIncomplete =
          completion?.jiraTransition &&
          (!toolsCalled.includes("jira_transition_issue") ||
            !isTransitionConfirmed(
              content,
              completion.jiraTransition.issueKey
            ));
        const narrating = isInternalNarration(content);

        if (
          (missingRequired.length > 0 || transitionIncomplete || narrating) &&
          !nudgedTransition &&
          completion?.jiraTransition
        ) {
          nudgedTransition = true;
          messages.push(choice.message);
          messages.push({
            role: "user",
            content: buildTransitionNudge(completion.jiraTransition),
          });
          continue;
        }

        if (narrating && !nudgedTransition) {
          nudgedTransition = true;
          messages.push(choice.message);
          messages.push({
            role: "user",
            content:
              "WRONG: Never narrate tools or transition IDs. Execute the task, then give ONE short outcome sentence only.",
          });
          continue;
        }

        if (content.length >= MIN_COMPLETE_CHARS) {
          return {
            reply: sanitizeSpokenReply(content, { maxChars }),
            usedTools,
            toolsCalled,
          };
        }

        if (!nudgedFinish) {
          nudgedFinish = true;
          messages.push(choice.message);
          messages.push({ role: "user", content: FINISH_NUDGE });
          continue;
        }

        return {
          reply: sanitizeSpokenReply(
            content || "Done — check Jira or GitHub for the latest.",
            { maxChars }
          ),
          usedTools,
          toolsCalled,
        };
      }

      usedTools = true;
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args =
            typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
        } catch {
          args = {};
        }

        const validation = validateTool?.(toolCall.function.name, args);
        if (validation && !validation.ok) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: validation.blockedMessage,
          });
          continue;
        }

        toolsCalled.push(toolCall.function.name);
        const result = await runTool(toolCall.function.name, args);
        const truncated =
          result.length > 8000 ? result.slice(0, 8000) + "\n...[truncated]" : result;
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: truncated,
        });
      }
    }

    return {
      reply: sanitizeSpokenReply(
        "I hit my step limit — partial work may be done. Check Jira or GitHub and ask again if needed.",
        { maxChars }
      ),
      usedTools,
      toolsCalled,
    };
  } finally {
    await cleanup();
  }
}
