import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import {
  createGroqChatCompletion,
  GROQ_TOOL_CALLING_MODEL,
  toolCallingSystemMessage,
} from "@/lib/groq-tool-chat";
import { createGitHubMCPClient } from "@/lib/mcp-client";
import { executeMCPTool } from "@/lib/mcp-executor";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function GET() {
  const mcpClient = await createGitHubMCPClient();
  const { tools: mcpTools } = await mcpClient.listTools();

  // Only expose the tools we actually need — keeps Groq focused
  const allowedTools = [
    "list_commits",
    "list_pull_requests",
    "search_issues",
  ];

  const groqTools = mcpTools
    .filter((tool) => allowedTools.includes(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema,
      },
    }));

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    toolCallingSystemMessage(),
    {
      role: "user",
      content: `You are Pulse, a voice-powered engineering co-pilot with the attitude and directness of Samuel L. Jackson — confident, no-nonsense, a little edge, but always professional.

My GitHub repo is: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}

Do the following:
1. Fetch the last 10 commits on the main branch, state the commit message and the author of each commit 
2. Fetch any open pull requests
3. Search for open issues: repo:${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO} is:open

Then give me a single voice briefing covering all three, state the commit message and the author. Keep it under 120 words. Sound like you mean it.`,
    },
  ];

  // Agentic tool-calling loop
  while (true) {
    const response = await createGroqChatCompletion(groq, {
      model: GROQ_TOOL_CALLING_MODEL,
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