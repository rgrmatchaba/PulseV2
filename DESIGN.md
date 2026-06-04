# Pulse v2 — Design Document

## What this file is for

Every visual and UX decision for Pulse v2 lives here. Before touching a component, read the relevant section. If something is not covered, add it here before building it. This document is the source of truth — not Tailwind defaults, not component library defaults, not vibes.

---

## 1. Concept

**"The Brew"** — an editorial, Morning Brew-inspired landing experience that greets Rue before the working session starts. The app is split into two phases:

1. **Landing page** — coffee animation, weather, tech news, greeting, one button
2. **Main dashboard** — the existing three-column layout (GitHub, Jira, Voice AI)

The landing page is not a login screen. It is a ritual. It sets the tone for the session before any tools are opened.

---

## 2. Time-of-day theming

The entire app — colors, animation speed, greeting copy — responds to the time of day. There are three modes:

| Mode | Hours | Feel |
|---|---|---|
| Morning | 06:00 – 11:59 | Warm, energised, amber light |
| Afternoon | 12:00 – 17:59 | Cooler, focused, linen tones |
| Evening | 18:00 – 05:59 | Deep, calm, low contrast |

Implement by reading `new Date().getHours()` on page load and applying a `data-theme` attribute to the root element. All CSS variables then respond to that attribute.

### CSS variable map

```css
/* Morning */
[data-theme="morning"] {
  --bg-primary: #F5F0E8;
  --bg-surface: #FAF6EF;
  --bg-card: #FFF8EE;
  --accent: #C17C3A;
  --accent-light: #EDD9B8;
  --text-primary: #3D2B1A;
  --text-secondary: #8B6E52;
  --text-muted: #A08060;
  --border: #D4C4A8;
  --border-card: #E8D4B4;
  --steam-color: #C17C3A;
  --badge-bg: #EDD9B8;
  --badge-text: #7A5230;
  --tag-bg: #EDD9B8;
  --tag-text: #7A5230;
  --btn-bg: #C17C3A;
  --btn-text: #FFF8F0;
}

/* Afternoon */
[data-theme="afternoon"] {
  --bg-primary: #EDE8DF;
  --bg-surface: #F4F0E8;
  --bg-card: #FAF7F2;
  --accent: #5C6B7A;
  --accent-light: #D4DCE4;
  --text-primary: #2A3340;
  --text-secondary: #6B7A8A;
  --text-muted: #8A9AAA;
  --border: #C8C0B4;
  --border-card: #D8D0C4;
  --steam-color: #8A9AAA;
  --badge-bg: #D4DCE4;
  --badge-text: #3A4A5A;
  --tag-bg: #D4DCE4;
  --tag-text: #3A4A5A;
  --btn-bg: #5C6B7A;
  --btn-text: #FFFFFF;
}

/* Evening */
[data-theme="evening"] {
   --bg-primary: #EDE8DF;
  --bg-surface: #F4F0E8;
  --bg-card: #FAF7F2;
  --accent: #5C6B7A;
  --accent-light: #D4DCE4;
  --text-primary: #2A3340;
  --text-secondary: #6B7A8A;
  --text-muted: #8A9AAA;
  --border: #C8C0B4;
  --border-card: #D8D0C4;
  --steam-color: #8A9AAA;
  --badge-bg: #D4DCE4;
  --badge-text: #3A4A5A;
  --tag-bg: #D4DCE4;
  --tag-text: #3A4A5A;
  --btn-bg: #5C6B7A;
  --btn-text: #FFFFFF;
}
```

---

## 3. Typography

| Use | Font | Weight | Size |
|---|---|---|---|
| Hero headline | Playfair Display | 400 (italic for second line) | 28px |
| Section labels | DM Sans | 500 | 10px, uppercase, 0.8px letter-spacing |
| Body / news titles | DM Sans | 400 | 12–13px |
| News description | DM Sans | 300 | 10–11px |
| Tags / badges | DM Sans | 500 | 9–10px |
| Button | DM Sans | 500 | 13px |
| Temperature | Playfair Display | 400 | 22px |
| Weather quote | DM Sans | 300 | 11px, italic |

Load via Google Fonts:
```
https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&display=swap
```

---

## 4. Layout

### Landing page

Two-column split, full viewport height.

```
┌─────────────────────┬──────────────────────────┐
│                     │  weather card             │
│   [time badge]      │                           │
│                     │  section label            │
│   [coffee SVG]      │  news card 1              │
│                     │  news card 2              │
│   headline          │  news card 3              │
│   subheadline       │                           │
│                     │                           │
│   [CTA button]      │                           │
└─────────────────────┴──────────────────────────┘
```

- Left column: 42% width, `var(--bg-primary)`, right border `0.5px solid var(--border)`
- Right column: flex 1, `var(--bg-surface)`
- No horizontal scrolling. No overflow.
- On screens below 768px: stack vertically (left on top, right below)

### Main dashboard (existing)

Three columns: GitHub | Jira | Voice AI. No changes to the existing layout from this document — the landing page is additive, not a replacement of the dashboard structure.

---

## 5. Coffee animation (SVG)

The coffee cup is an SVG with animated steam paths. Rules:

- The cup itself is static — a rounded rect body, an ellipse saucer, a handle path, a filled coffee ellipse inside
- Three steam paths rise from the coffee surface using a `translateY` + `opacity` keyframe animation
- Each steam path is offset by 0.6s from the previous (`animation-delay`)
- Steam color uses `var(--steam-color)` so it adapts to the time theme
- Animation duration: 2s for morning, 3s for afternoon/evening (slower = calmer feel)
- The cup size on the landing page is 90–100px. Do not scale it larger — the whitespace around it matters

Steam keyframe:
```css
@keyframes steam {
  0%, 100% { transform: translateY(0) scaleX(1); opacity: 0.5; }
  50% { transform: translateY(-10px) scaleX(1.15); opacity: 1; }
}
```

---

## 6. Landing page components

### 6a. Time badge

Top-left of the left column. Shows the current period and a simple icon.

- Morning: `☀ Morning`
- Afternoon: `◑ Afternoon`
- Evening: `☾ Evening`
- Styling: `var(--badge-bg)` background, `var(--badge-text)` text, `border-radius: 999px`, `font-size: 10px`, `padding: 3px 10px`

### 6b. Greeting headline

```
Start your day
with clarity, Rue.
```

Second line is italic. Uses Playfair Display. Color: `var(--text-primary)`.

Afternoon variant: `Make the most of your afternoon, Rue.`
Evening variant: `Wind it down well, Rue.`

These are hardcoded strings — no LLM needed for this copy.

### 6c. Sub-headline

```
Your Jira queue, GitHub status, and the world —
before you type a line of code.
```

Afternoon: `A clear head in the second half. Let's see where things stand.`
Evening: `Wrap up clean. Here's what needs your attention.`

### 6d. CTA button

```
Ready to Carpe Diem?
```

- `var(--btn-bg)` background, `var(--btn-text)` text
- `border-radius: 999px`
- `padding: 10px 24px`
- On click: triggers the voice briefing flow (see section 8)
- No hover color change needed — a subtle `transform: scale(0.97)` on `active` is enough

### 6e. Weather card

Hardcoded location: **Harare, ZW**. Fetch from Open-Meteo (free, no API key):

```
https://api.open-meteo.com/v1/forecast?latitude=-17.8252&longitude=31.0335&current=temperature_2m,weathercode&timezone=Africa/Harare
```

Display:
- Temperature in Celsius
- A short generated weather description based on the WMO weather code (map the code to a human-readable string — no LLM needed)
- A witty one-liner below the description. These are hardcoded strings mapped to weather condition groups:
  - Clear: `"Perfect day to ship something"`
  - Cloudy: `"Good focus weather"`
  - Rain: `"Stay in, stay productive"`
  - Storm: `"Maybe don't open Jira"`

### 6f. Tech news cards

Source: **Hacker News Algolia API** (free, no key, reliable uptime):

```
https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&query=AI
```

Display per card:
- Tag (derive from title — if title contains "AI", "LLM", "model" → `AI & LLMs`. If "GitHub", "dev", "code" → `Dev Tools`. Default → `Tech`)
- Estimated read time (use `Math.ceil(wordCount / 200)` min)
- Title (truncate at 60 chars)
- One-line description (use the `story_text` if available, otherwise just the title repeated)
- A placeholder icon from Tabler based on tag category

---

## 7. Transitions

### Landing → Dashboard

Triggered after the voice briefing finishes (see section 8).

- Fade out the landing page: `opacity 0` over `600ms` with `ease-in-out`
- Fade in the dashboard: `opacity 0 → 1` over `600ms`, starting after the landing fade completes
- Use a simple CSS class toggle — no animation library needed
- The dashboard should be pre-rendered behind the landing page (`opacity: 0`, `position: absolute`) so the transition is instant

```css
.landing-page {
  transition: opacity 600ms ease-in-out;
}
.landing-page.fade-out {
  opacity: 0;
  pointer-events: none;
}
.dashboard {
  opacity: 0;
  transition: opacity 600ms ease-in-out;
}
.dashboard.fade-in {
  opacity: 1;
}
```

---

## 8. Voice briefing flow

This is the sequence that starts when the user clicks "Ready to Carpe Diem?":

```
1. Button click
      ↓
2. Fetch Jira tickets (in-progress, blocked, due today)
   Fetch GitHub status (open PRs, recent commits, review requests)
      ↓
3. Send fetched data to Ollama (llama3.2 or similar local model)
   Prompt: generate a 3-4 sentence conversational morning briefing.
   Style: friendly, like a colleague who glanced at your board.
   Example output: "You've got a few things moving on the API work —
   looks like most of your in-progress tickets tie back to that same
   service. One's blocked waiting on Ruth. Nothing due today, but
   it's not a light week."
      ↓
4. Send LLM text to ElevenLabs TTS → stream audio → play in browser
      ↓
5. Once audio finishes playing → trigger landing → dashboard transition
```

### Ollama config

- Model: `llama3.2` (default local, fast enough for a 4-sentence summary)
- Endpoint: `http://localhost:11434/api/generate`
- Keep `stream: false` for simplicity — wait for the full response before sending to ElevenLabs
- Temperature: `0.7` (enough variation to not feel robotic, not so high it hallucinates ticket details)

### ElevenLabs config

- Voice: TBD (to be selected before implementation — see open decisions)
- Model: `eleven_turbo_v2_5` (lowest latency, good enough quality for a briefing)
- Output format: `mp3_44100_128`
- Stream the audio back and play via the Web Audio API or a simple `<audio>` element with a blob URL

### Prompt template

```
You are Pulse, a friendly AI engineering co-pilot giving a quick morning briefing.
Keep it to 3-4 sentences. Sound like a colleague, not a status report.
Be specific about what you see — mention blockers, patterns across tickets, and
anything that looks urgent. Do not list every ticket. Summarise.

Jira data:
{jira_summary}

GitHub data:
{github_summary}
```

---

## 9. Component file structure

```
app/
├── page.tsx                  ← renders LandingPage or Dashboard based on state
├── components/
│   ├── landing/
│   │   ├── LandingPage.tsx   ← root landing component
│   │   ├── CoffeeCup.tsx     ← SVG animation component
│   │   ├── WeatherCard.tsx   ← fetches and displays weather
│   │   ├── NewsCard.tsx      ← single news card
│   │   ├── NewsFeed.tsx      ← fetches HN and renders 3 NewsCards
│   │   └── GreetingText.tsx  ← time-aware headline and sub-text
│   ├── dashboard/
│   │   └── (existing components unchanged)
│   └── ui/
│       └── (shared primitives)
├── hooks/
│   ├── useTimeTheme.ts       ← returns "morning" | "afternoon" | "evening"
│   ├── useWeather.ts         ← fetches Open-Meteo data
│   └── useNews.ts            ← fetches HN Algolia data
├── lib/
│   ├── briefing.ts           ← builds the Ollama prompt and calls the API
│   ├── tts.ts                ← calls ElevenLabs and returns audio blob
│   └── weatherCodes.ts       ← maps WMO codes to strings and one-liners
```

---

## 10. Open decisions (resolve before implementing)

| Decision | Status | Notes |
|---|---|---|
| ElevenLabs voice ID | Not selected | Pick before TTS work starts. Should sound warm, calm, professional. Test Rachel, Aria, or a custom voice. |
| Ollama model | `llama3.2` default | If response quality is poor, try `mistral` or `llama3.1:8b` |
| News source | Hacker News Algolia | May swap for NewsAPI if HN stories are too niche. Revisit after first test. |
| Mobile layout | Stacked (left on top) | Breakpoint at 768px. Low priority for V1 — this runs locally. |
| Dashboard transition trigger | Audio `onended` event | Fall back to a 10s timeout if ElevenLabs fails |

---

## 11. What this is not

- This is not a consumer app. It is a personal tool that also serves as an AI engineering portfolio piece.
- The landing page is not meant to impress a random visitor — it is meant to demonstrate voice AI orchestration, time-aware theming, and multi-source data aggregation to a technical hiring audience.
- Do not add features to make it look impressive. Add features because they make the briefing genuinely useful.
