"use client";

interface QuickSummaryCardProps {
  briefingText: string | null;
  briefingReady: boolean;
}

export default function QuickSummaryCard({
  briefingText,
  briefingReady,
}: QuickSummaryCardProps) {
  const preview = briefingText
    ? briefingText.slice(0, 220) + (briefingText.length > 220 ? "…" : "")
    : null;

  return (
    <div style={{
      backgroundColor: "var(--accent-light)",
      border: "1px solid var(--border-card)",
      borderRadius: 12,
      padding: "20px 24px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--accent)" }}>✦</span>
        <p style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}>
          Today&apos;s Brief
        </p>
      </div>

      {/* Briefing text */}
      <p style={{
        margin: 0,
        marginBottom: 16,
        fontFamily: "var(--font-body)",
        fontWeight: 300,
        fontSize: 12,
        color: "var(--text-primary)",
        lineHeight: 1.7,
        minHeight: 60,
      }}>
        {preview ?? (
          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Preparing greeting, weather, tech & briefing…
          </span>
        )}
      </p>

      <p style={{
        margin: 0,
        fontFamily: "var(--font-body)",
        fontWeight: 300,
        fontSize: 10,
        color: "var(--text-muted)",
      }}>
        {briefingReady ? "Updated just now" : "Fetching…"}
      </p>
    </div>
  );
}
