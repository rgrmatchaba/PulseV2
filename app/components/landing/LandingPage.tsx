"use client";

import { useEffect, useState } from "react";
import { useTimeTheme } from "@/hooks/useTimeTheme";
import CoffeeCup from "./CoffeeCup";
import WeatherCard from "./WeatherCard";
import NewsFeed from "./NewsFeed";
import QuickSummaryCard from "./QuickSummaryCard";

interface LandingPageProps {
  onEnter: () => void;
}

const headlineConfig = {
  morning: { line1: "Start your day", line2: "with clarity, Rue." },
  afternoon: { line1: "Make the most of", line2: "your afternoon, Rue." },
  evening: { line1: "Wind it down", line2: "well, Rue." },
};

const subConfig = {
  morning: "Your Jira queue, GitHub status, and the world —\nbefore you type a line of code.",
  afternoon: "A clear head in the second half. Let's see where things stand.",
  evening: "Wrap up clean. Here's what needs your attention.",
};

export default function LandingPage({ onEnter }: LandingPageProps) {
  const theme = useTimeTheme();
  const [routineText, setRoutineText] = useState<string | null>(null);
  const [routineReady, setRoutineReady] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let url: string | null = null;

    fetch("/api/landing-routine")
      .then((r) => r.json())
      .then(async ({ text, error }) => {
        if (error || !text) {
          console.error("[Pulse] landing routine prefetch error:", error);
          setRoutineReady(true);
          return;
        }
        console.log("[Pulse] landing routine prefetched:", text?.slice(0, 80) + "…");
        setRoutineText(text);
        setRoutineReady(true);

        // Pre-generate audio in background so click is instant
        try {
          const ttsRes = await fetch("/api/landing-speak", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (ttsRes.ok) {
            const blob = await ttsRes.blob();
            url = URL.createObjectURL(blob);
            setAudioUrl(url);
            console.log("[Pulse] audio pre-generated");
          }
        } catch (e) {
          console.error("[Pulse] audio pre-generation failed:", e);
        }
      })
      .catch((e) => {
        console.error("[Pulse] landing routine prefetch failed:", e);
        setRoutineReady(true);
      });

    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);

  async function handleCTA() {
    if (playing) return;
    if (!routineText) { onEnter(); return; }

    setPlaying(true);
    try {
      let url = audioUrl;

      if (!url) {
        // Audio not ready yet — generate on demand
        const ttsRes = await fetch("/api/landing-speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: routineText }),
        });
        if (!ttsRes.ok) {
          console.error("[Pulse] TTS error:", ttsRes.statusText);
          onEnter();
          return;
        }
        const blob = await ttsRes.blob();
        url = URL.createObjectURL(blob);
      }

      const audio = new Audio(url);
      const fallback = setTimeout(() => { URL.revokeObjectURL(url!); onEnter(); }, 120000);
      audio.onended = () => { clearTimeout(fallback); URL.revokeObjectURL(url!); onEnter(); };
      audio.onerror = () => { clearTimeout(fallback); onEnter(); };
      await audio.play();
    } catch (e) {
      console.error("[Pulse] TTS failed:", e);
      onEnter();
    } finally {
      setPlaying(false);
    }
  }

  const headline = headlineConfig[theme];
  const sub = subConfig[theme];

  return (
    <div style={{
      display: "flex",
      width: "100%",
      height: "100vh",
      overflow: "hidden",
      backgroundColor: "var(--bg-primary)",
    }}>
      {/* ── Left column ── */}
      <div style={{
        position: "relative",
        width: "42%",
        flexShrink: 0,
        backgroundColor: "var(--bg-primary)",
        borderRight: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 52px",
        boxSizing: "border-box",
        gap: 28,
        textAlign: "center",
      }}>
        {/* Push content to lower half */}
        <div style={{ flex: 1 }} />

        <CoffeeCup theme={theme} size={130} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <p style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              fontSize: 40,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}>
              {headline.line1}
            </p>
            <p style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              fontStyle: "italic",
              fontSize: 40,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}>
              {headline.line2}
            </p>
          </div>

          <p style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontWeight: 300,
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            whiteSpace: "pre-line",
            maxWidth: 340,
          }}>
            {sub}
          </p>
        </div>

        {/* TODO: remove — dev bypass */}
        <button
          onClick={onEnter}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Skip →
        </button>

        <button
          onClick={handleCTA}
          disabled={!routineReady || playing}
          style={{
            alignSelf: "flex-start",
            backgroundColor: routineReady && !playing ? "var(--btn-bg)" : "var(--border)",
            color: routineReady && !playing ? "var(--btn-text)" : "var(--text-muted)",
            borderRadius: 999,
            padding: "10px 24px",
            border: "none",
            cursor: routineReady && !playing ? "pointer" : "default",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            fontSize: 13,
            transition: "transform 80ms ease, background-color 300ms ease",
          }}
          onMouseDown={(e) => {
            if (routineReady && !playing)
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          {playing ? "Playing…" : !routineReady ? "Preparing your day…" : "Ready to carpe diem?"}
        </button>

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Right column ── */}
      <div style={{
        flex: 1,
        backgroundColor: "var(--bg-surface)",
        padding: "40px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        boxSizing: "border-box",
        overflowY: "auto",
      }}>
        <WeatherCard />
        <NewsFeed />
        <QuickSummaryCard
          briefingText={routineText}
          briefingReady={routineReady}
        />
      </div>
    </div>
  );
}
