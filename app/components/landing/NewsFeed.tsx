"use client";

import { useNews } from "@/hooks/useNews";
import NewsCard from "./NewsCard";

const skeletonBase: React.CSSProperties = {
  backgroundColor: "var(--accent-light)",
  borderRadius: 4,
  opacity: 0.35,
};

function SkeletonCard() {
  return (
    <div style={{
      display: "flex",
      gap: 16,
      backgroundColor: "var(--bg-card)",
      border: "1px solid var(--border-card)",
      borderRadius: 12,
      padding: "16px 20px",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ ...skeletonBase, height: 18, width: 72, borderRadius: 999 }} />
          <div style={{ ...skeletonBase, height: 12, width: 48, marginTop: 3 }} />
        </div>
        <div style={{ ...skeletonBase, height: 14, width: "90%", marginBottom: 6 }} />
        <div style={{ ...skeletonBase, height: 14, width: "70%", marginBottom: 10 }} />
        <div style={{ ...skeletonBase, height: 11, width: "85%" }} />
      </div>
      <div style={{ ...skeletonBase, width: 64, height: 64, borderRadius: 8, flexShrink: 0 }} />
    </div>
  );
}

export default function NewsFeed() {
  const news = useNews();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Section header */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        paddingBottom: 12,
        borderBottom: "1px solid var(--border)",
        marginBottom: 14,
      }}>
        <p style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 20,
          color: "var(--text-primary)",
        }}>
          Latest in Tech
        </p>
        <span style={{
          fontFamily: "var(--font-body)",
          fontWeight: 400,
          fontSize: 11,
          color: "var(--text-muted)",
          cursor: "default",
        }}>
          View All
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(news.status === "loading" || news.status === "error") && (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {news.status === "ok" &&
          news.stories.slice(0, 2).map((story) => (
            <NewsCard key={story.objectID} story={story} />
          ))}
      </div>
    </div>
  );
}
