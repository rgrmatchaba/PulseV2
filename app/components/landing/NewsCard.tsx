"use client";

import { NewsStory } from "@/hooks/useNews";

export function deriveTag(title: string): "AI & LLMs" | "Dev Tools" | "Tech" {
  const t = title.toLowerCase();
  if (/\b(ai|llm|llms|model|gpt|claude|gemini|anthropic|openai|llama|mistral)\b/.test(t))
    return "AI & LLMs";
  if (/\b(github|dev|code|tool|vscode|ide|compiler|sdk|cli|api|rust|python|typescript|swift)\b/.test(t))
    return "Dev Tools";
  return "Tech";
}

const tagGradients: Record<string, string> = {
  "AI & LLMs": "linear-gradient(135deg, #3D2B1A 0%, #C17C3A 100%)",
  "Dev Tools": "linear-gradient(135deg, #2A3340 0%, #5C6B7A 100%)",
  "Tech": "linear-gradient(135deg, #1a2a2a 0%, #4a7a6a 100%)",
};

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

function calcReadTime(text?: string, title?: string): number {
  const words = (text || title || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

interface NewsCardProps {
  story: NewsStory;
}

export default function NewsCard({ story }: NewsCardProps) {
  const tag = deriveTag(story.title);
  const readTime = calcReadTime(story.story_text, story.title);
  const displayTitle = truncate(story.title, 72);
  const description = story.story_text
    ? truncate(story.story_text.replace(/<[^>]+>/g, ""), 100)
    : "";

  return (
    <a
      href={story.url ?? `https://news.ycombinator.com/item?id=${story.objectID}`}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        textDecoration: "none",
        backgroundColor: "var(--bg-card)",
        border: "1px solid var(--border-card)",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Tag + read time row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{
            display: "inline-block",
            backgroundColor: "var(--tag-bg)",
            color: "var(--tag-text)",
            borderRadius: 999,
            fontSize: 9,
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            letterSpacing: "0.08em",
            padding: "3px 10px",
          }}>
            {tag}
          </span>
          <span style={{
            fontSize: 10,
            fontFamily: "var(--font-body)",
            fontWeight: 300,
            color: "var(--text-muted)",
          }}>
            {readTime} min read
          </span>
        </div>

        {/* Headline */}
        <p style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 14,
          color: "var(--text-primary)",
          lineHeight: 1.4,
          marginBottom: description ? 6 : 0,
        }}>
          {displayTitle}
        </p>

        {/* Description */}
        {description && (
          <p style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontWeight: 300,
            fontSize: 11,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}>
            {description}
          </p>
        )}
      </div>

      {/* Thumbnail — gradient box since HN has no images */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 8,
        flexShrink: 0,
        background: tagGradients[tag],
        opacity: 0.85,
      }} />
    </a>
  );
}
