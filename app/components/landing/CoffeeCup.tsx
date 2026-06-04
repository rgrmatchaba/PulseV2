"use client";

import { TimeTheme } from "@/hooks/useTimeTheme";

interface CoffeeCupProps {
  theme: TimeTheme;
  size?: number;
}

export default function CoffeeCup({ theme, size = 96 }: CoffeeCupProps) {
  const duration = theme === "morning" ? "2s" : "3s";

  const steamStyle = (delay: string): React.CSSProperties => ({
    animation: `steam ${duration} ease-in-out ${delay} infinite`,
    fill: "none",
    stroke: "var(--steam-color)",
    strokeWidth: 2,
    strokeLinecap: "round",
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Steam paths — rise from inside the cup */}
      <path
        d="M38 36 Q35 30 38 24 Q41 18 38 12"
        style={steamStyle("0s")}
      />
      <path
        d="M48 36 Q45 29 48 23 Q51 17 48 11"
        style={steamStyle("0.6s")}
      />
      <path
        d="M58 36 Q55 30 58 24 Q61 18 58 12"
        style={steamStyle("1.2s")}
      />

      {/* Saucer */}
      <ellipse
        cx="48"
        cy="80"
        rx="28"
        ry="5"
        fill="var(--accent-light)"
        stroke="var(--border)"
        strokeWidth="1"
      />

      {/* Cup body */}
      <rect
        x="22"
        y="44"
        width="52"
        height="34"
        rx="6"
        ry="6"
        fill="var(--bg-card)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />

      {/* Coffee fill (ellipse inside cup top) */}
      <ellipse
        cx="48"
        cy="46"
        rx="24"
        ry="6"
        fill="var(--accent)"
        opacity="0.7"
      />

      {/* Handle */}
      <path
        d="M74 52 Q86 52 86 61 Q86 70 74 70"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
