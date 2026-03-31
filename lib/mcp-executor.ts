import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export async function executeMCPTool(
  client: Client,
  toolName: string,
  toolArgs: Record<string, unknown>
) {
  const result = await client.callTool({
    name: toolName,
    arguments: toolArgs,
  });

  if (!("content" in result) || !Array.isArray(result.content)) {
    if ("toolResult" in result) {
      const tr = result.toolResult;
      return typeof tr === "string" ? tr : JSON.stringify(tr);
    }
    return "";
  }

  const text = result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return text;
}