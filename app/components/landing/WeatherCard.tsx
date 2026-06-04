"use client";

import { useWeather } from "@/hooks/useWeather";

function SunCloudIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sun */}
      <circle cx="20" cy="18" r="8" fill="var(--accent)" opacity="0.85" />
      <line x1="20" y1="6" x2="20" y2="3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="33" x2="20" y2="30" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="18" x2="5" y2="18" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <line x1="35" y1="18" x2="32" y2="18" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <line x1="11.5" y1="9.5" x2="9.4" y2="7.4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <line x1="30.6" y1="28.6" x2="28.5" y2="26.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      {/* Cloud */}
      <rect x="14" y="28" width="28" height="14" rx="7" fill="var(--bg-surface)" />
      <circle cx="22" cy="28" r="7" fill="var(--bg-surface)" />
      <circle cx="35" cy="31" r="5" fill="var(--bg-surface)" />
      <rect x="14" y="29" width="28" height="13" rx="6.5" fill="var(--border)" opacity="0.3" />
      <rect x="15" y="29" width="26" height="12" rx="6" fill="var(--bg-card)" />
      <circle cx="22" cy="29" r="6" fill="var(--bg-card)" />
      <circle cx="34" cy="31" r="5" fill="var(--bg-card)" />
    </svg>
  );
}

const skeletonBase: React.CSSProperties = {
  backgroundColor: "var(--accent-light)",
  borderRadius: 4,
  opacity: 0.4,
};

export default function WeatherCard() {
  const weather = useWeather();

  if (weather.status === "error") return null;

  if (weather.status === "loading") {
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1 }}>
          <div style={{ ...skeletonBase, width: 48, height: 48, borderRadius: 8 }} />
          <div>
            <div style={{ ...skeletonBase, height: 32, width: 72, marginBottom: 6 }} />
            <div style={{ ...skeletonBase, height: 12, width: 80 }} />
          </div>
        </div>
        <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24, minWidth: 160 }}>
          <div style={{ ...skeletonBase, height: 10, width: 110, marginBottom: 8 }} />
          <div style={{ ...skeletonBase, height: 12, width: 140 }} />
        </div>
      </div>
    );
  }

  const { temperature, description, oneLiner } = weather.data;

  return (
    <div style={cardStyle}>
      {/* Left: icon + temp + location */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1 }}>
        <SunCloudIcon />
        <div>
          <p style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 400,
            fontSize: 28,
            color: "var(--text-primary)",
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {temperature}°C
          </p>
          <p style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontWeight: 400,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}>
            Harare, ZW
          </p>
        </div>
      </div>

      {/* Right: forecast label + quote */}
      <div style={{
        borderLeft: "1px solid var(--border)",
        paddingLeft: 24,
        minWidth: 160,
      }}>
        <p style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: 9,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}>
          Today&apos;s Forecast
        </p>
        <p style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontWeight: 300,
          fontSize: 11,
          fontStyle: "italic",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}>
          &ldquo;{oneLiner}&rdquo;
        </p>
        <p style={{
          margin: 0,
          marginTop: 4,
          fontFamily: "var(--font-body)",
          fontWeight: 300,
          fontSize: 10,
          color: "var(--text-muted)",
        }}>
          {description}
        </p>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-card)",
  border: "1px solid var(--border-card)",
  borderRadius: 12,
  padding: "20px 28px",
  display: "flex",
  alignItems: "center",
  gap: 24,
};
