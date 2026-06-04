"use client";

import { TimeTheme } from "@/hooks/useTimeTheme";

interface GreetingTextProps {
  theme: TimeTheme;
}

const badgeConfig = {
  morning: { icon: "☀", label: "Morning" },
  afternoon: { icon: "◑", label: "Afternoon" },
  evening: { icon: "☾", label: "Evening" },
};

const headlineConfig = {
  morning: { line1: "Start your day", line2: "with clarity, Rue." },
  afternoon: { line1: "Make the most of your", line2: "afternoon, Rue." },
  evening: { line1: "Wind it down", line2: "well, Rue." },
};

const subConfig = {
  morning:
    "Your Jira queue, GitHub status, and the world —\nbefore you type a line of code.",
  afternoon:
    "A clear head in the second half. Let's see where things stand.",
  evening: "Wrap up clean. Here's what needs your attention.",
};

export default function GreetingText({ theme }: GreetingTextProps) {
  const badge = badgeConfig[theme];
  const headline = headlineConfig[theme];
  const sub = subConfig[theme];

  return (
    <>
      {/* Time badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: "var(--badge-bg)",
          color: "var(--badge-text)",
          borderRadius: 999,
          fontSize: 10,
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          letterSpacing: "0.05em",
          padding: "3px 10px",
          alignSelf: "flex-start",
        }}
      >
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </div>

      {/* Headline */}
      <div>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 28,
            color: "var(--text-primary)",
            lineHeight: 1.3,
          }}
        >
          {headline.line1}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontStyle: "italic",
            fontSize: 28,
            color: "var(--text-primary)",
            lineHeight: 1.3,
          }}
        >
          {headline.line2}
        </p>
      </div>

      {/* Sub-headline */}
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontWeight: 300,
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          whiteSpace: "pre-line",
        }}
      >
        {sub}
      </p>
    </>
  );
}
