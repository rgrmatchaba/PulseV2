import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function createAtlassianMCPClient() {
    const client = new Client({ name: "pulse-v2", version: "1.0.0" });
  
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:8080/mcp")
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