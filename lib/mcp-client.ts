import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function createAtlassianMCPClient() {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;

  if (!email || !token) {
    throw new Error("Missing ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN");
  }

  const credentials = Buffer.from(`${email}:${token}`).toString("base64");

  const client = new Client({ name: "pulse-v2", version: "1.0.0" });

  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.atlassian.com/v1/mcp/authv2"),
    {
      requestInit: {
        headers: { Authorization: `Basic ${credentials}` },
      },
    }
  );

  await client.connect(transport);
  return client;
}

  export async function createGitHubMCPClient() {
    const pat = process.env.GITHUB_PAT_TOKEN;
  
    if (!pat) {
      throw new Error("Missing GITHUB_PAT_TOKEN in env");
    }
  
    const client = new Client({ name: "pulse-v2", version: "1.0.0" });
  
    const transport = new StreamableHTTPClientTransport(
      new URL("https://api.githubcopilot.com/mcp/"),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${pat}` },
        },
      }
    );
  
    await client.connect(transport);
    return client;
  }