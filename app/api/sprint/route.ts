import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { createAtlassianMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function GET() {
  const mcpClient = await createAtlassianMCPClient();
  const { tools: mcpTools } = await mcpClient.listTools();

  const allowedTools = [
    "jira_get_sprints_from_board",
    "jira_get_sprint_issues",
    "jira_search",
  ];

  const groqTools = mcpTools
    .filter((t) => allowedTools.includes(t.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema,
      },
    }));

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: `You are Pulse, a voice-powered engineering co-pilot with the attitude and directness of Samuel L. Jackson — confident, no-nonsense, a little edge, always professional.

My Jira board ID is: ${process.env.JIRA_BOARD_ID}
My Jira project key is: ${process.env.JIRA_PROJECT_KEY}

Do the following steps in order:
1. Use jira_get_sprints_from_board with board_id ${process.env.JIRA_BOARD_ID} and state "active" to get the active sprint
2. Use jira_get_sprint_issues with the sprint ID you just found to get all tickets
3. Use jira_search with JQL: project = ${process.env.JIRA_PROJECT_KEY} AND updated <= -7d AND statusCategory != Done to find stale tickets

Then give me a concise voice briefing covering: sprint name, tickets in progress, tickets done, and any stale ones. Under 120 words. Sound like you mean it.`,
    },
  ];

  while (true) {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      tools: groqTools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];

    if (
      choice.finish_reason === "stop" ||
      !choice.message.tool_calls?.length
    ) {
      await mcpClient.close();
      return NextResponse.json({ briefing: choice.message.content });
    }

    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const args =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;

      const result = await executeMCPTool(
        mcpClient,
        toolCall.function.name,
        args
      );

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }
}
