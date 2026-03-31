# Changelog

All notable changes to Pulse V2 will be documented here.

---

## [Unreleased]

### 2026-03-28

#### Added
- **`@modelcontextprotocol/sdk`** — Installed MCP SDK to enable Model Context Protocol integration, allowing Pulse to connect to external tools and data sources via MCP servers.
- **`groq-sdk`** — Installed Groq SDK to use Groq's fast LLM inference API as the AI backend for Pulse.
- **`CHANGELOG.md`** — Added this file to track project changes over time.

#### Removed
- **`@anthropic-ai/sdk`** — Removed because the project switched from Anthropic's Claude API to Groq as the LLM provider, making this dependency unnecessary.

#### Fixed
- **`app/api/pulse/route.ts`** — Rewrote the API route to use the correct Groq SDK shape. The original code used Anthropic's API structure (`client.messages.create`, `message.content[0].type`) which is incompatible with Groq. Updated to use `client.chat.completions.create` and `message.choices[0]?.message?.content`, matching the Groq/OpenAI-compatible response format. Model set to `llama-3.3-70b`.

---

## [0.1.0] — 2026-03-28 — Initial Setup

#### Added
- **Next.js 15 app** — Bootstrapped with `create-next-app` using TypeScript, Tailwind CSS, ESLint, and the App Router. Foundation for the Pulse V2 web interface.
- **`@anthropic-ai/sdk`** — Initially added to power AI features (later replaced by Groq).
