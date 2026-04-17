"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Issue {
  number: number;
  title: string;
  state: string;
  labels?: Array<{ name: string; color?: string }>;
  updated_at?: string;
  updatedAt?: string;
  html_url?: string;
  url?: string;
  user?: { login: string };
}

interface PR {
  number: number;
  title: string;
  state: string;
  updated_at?: string;
  html_url?: string;
  user?: { login: string };
}

interface Commit {
  sha: string;
  commit?: { message: string; author?: { name: string; date: string } };
  html_url?: string;
}

interface RepoData {
  issues: Issue[];
  prs: PR[];
  commits: Commit[];
  owner: string;
  repo: string;
}

interface JiraTicket {
  id: string;
  key: string;
  summary?: string;
  status?: { name: string; category?: string; color?: string };
  issue_type?: { name: string };
  priority?: { name: string };
  assignee?: { display_name: string };
  reporter?: { display_name: string };
  created?: string;
  updated?: string;
}

interface JiraData {
  tickets: JiraTicket[];
  sprintName: string;
}

type VoiceState = "idle" | "recording" | "processing";
type VoiceRoute = "jira" | "github" | "clarify" | "irrelevant" | "error" | null;
interface ContextMessage { role: "user" | "assistant"; content: string }

// ── Audio playback helper ─────────────────────────────────────────────────────

async function streamAudio(response: Response): Promise<HTMLAudioElement> {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  audio.play().catch(console.error);
  return audio;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function isStale(dateStr?: string): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() > 7 * 86400000;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PulseDashboard() {
  const [data, setData] = useState<RepoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [jiraData, setJiraData] = useState<JiraData | null>(null);
  const [jiraLoading, setJiraLoading] = useState(true);
  const [jiraError, setJiraError] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [voiceRoute, setVoiceRoute] = useState<VoiceRoute>(null);
  const [voiceContext, setVoiceContext] = useState<ContextMessage[]>([]);
  const [briefingPlaying, setBriefingPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"issues" | "prs" | "commits">("issues");
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Fetch repo data ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/github-issues")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Fetch Jira data ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/jira-issues")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setJiraError(d.error);
        else setJiraData(d);
      })
      .catch((e) => setJiraError(String(e)))
      .finally(() => setJiraLoading(false));
  }, []);

  // ── Play voice briefing ────────────────────────────────────────────────────
  async function playBriefing() {
    if (briefingPlaying) return;
    setBriefingPlaying(true);
    setTranscript("Generating briefing...");
    try {
      const res = await fetch("/api/speak");
      const audio = await streamAudio(res);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        setBriefingPlaying(false);
        setTranscript("Briefing complete. Tap mic to respond.");
      });
      setTranscript("Playing briefing...");
    } catch (e) {
      setError(String(e));
      setBriefingPlaying(false);
      setTranscript("");
    }
  }

  // ── Start recording ────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        try {
          // Step 1 — transcribe
          const transcribeRes = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "content-type": "audio/webm" },
            body: blob,
          });
          const { transcript: t } = await transcribeRes.json();
          setTranscript(t || "Nothing detected.");

          if (!t) return;

          // Step 2 — execute the command
          setTranscript(`"${t}" — routing...`);
          const commandRes = await fetch("/api/voice-command", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transcript: t, context: voiceContext }),
          });
          const commandText = await commandRes.text();
          const { reply, route } = commandText
            ? JSON.parse(commandText)
            : { reply: "No response from command.", route: "error" };

          setVoiceRoute(route ?? null);

          // Keep context alive during clarification so router remembers the exchange.
          // Clear it once a command is actually executed.
          if (route === "clarify") {
            setVoiceContext((prev) => [
              ...prev,
              { role: "user", content: t },
              { role: "assistant", content: reply },
            ]);
          } else {
            setVoiceContext([]);
          }

          // Step 3 — stream the reply via Deepgram TTS (starts playing on first chunk)
          const speakRes = await fetch("/api/speak-text", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: reply }),
          });
          await streamAudio(speakRes);

          setTranscript(`"${t}"\n\n→ ${reply}`);
        } catch (e) {
          setTranscript("Command failed.");
          console.error(e);
        } finally {
          setVoiceState("idle");
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceState("recording");
      setTranscript("");
    } catch {
      setError("Microphone access denied.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function handleMicClick() {
    if (voiceState === "idle") startRecording();
    else if (voiceState === "recording") stopRecording();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const staleCount = Array.isArray(data?.issues)
    ? data.issues.filter((i) => isStale(i.updated_at ?? i.updatedAt)).length
    : 0;

  return (
    <div style={styles.root}>
      {/* Ambient background grid */}
      <div style={styles.gridOverlay} />

      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.pulseIcon}>
            <span style={styles.pulseDot} />
          </div>
          <div>
            <h1 style={styles.title}>PULSE</h1>
            <p style={styles.subtitle}>
              {data ? `${data.owner}/${data.repo}` : "Engineering Co-Pilot"}
            </p>
          </div>
        </div>
        <div style={styles.headerStats}>
          {data && (
            <>
              <Stat label="OPEN" value={data.issues.length} />
              <Stat label="PRS" value={data.prs.length} />
              <Stat label="STALE" value={staleCount} accent={staleCount > 0} />
            </>
          )}
        </div>
      </header>

      {/* ── Main grid ── */}
      <main style={styles.main}>
        {/* ── Left panel: ticket data ── */}
        <section style={styles.panel}>
          <div style={styles.tabs}>
            {(["issues", "prs", "commits"] as const).map((tab) => (
              <button
                key={tab}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab ? styles.tabActive : {}),
                }}
                onClick={() => setActiveTab(tab)}
              >
                {tab.toUpperCase()}
                <span style={styles.tabCount}>
                  {tab === "issues"
                    ? data?.issues.length ?? 0
                    : tab === "prs"
                    ? data?.prs.length ?? 0
                    : data?.commits.length ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div style={styles.listContainer}>
            {loading && (
              <div style={styles.empty}>
                <div style={styles.spinner} />
                <p style={styles.emptyText}>Fetching from GitHub...</p>
              </div>
            )}

            {error && <p style={styles.errorText}>{error}</p>}

            {!loading && !error && data && (
              <>
                {activeTab === "issues" &&
                  (data.issues.length === 0 ? (
                    <EmptyState label="No open issues" />
                  ) : (
                    data.issues.map((issue) => (
                      <IssueCard key={issue.number} issue={issue} />
                    ))
                  ))}

                {activeTab === "prs" &&
                  (data.prs.length === 0 ? (
                    <EmptyState label="No open pull requests" />
                  ) : (
                    data.prs.map((pr) => <PRCard key={pr.number} pr={pr} />)
                  ))}

                {activeTab === "commits" &&
                  (data.commits.length === 0 ? (
                    <EmptyState label="No commits found" />
                  ) : (
                    data.commits.map((c) => (
                      <CommitCard key={c.sha} commit={c} />
                    ))
                  ))}
              </>
            )}
          </div>
        </section>

        {/* ── Middle panel: Jira ── */}
        <section style={styles.panel}>
          <div style={styles.tabs}>
            <div style={{ ...styles.tab, ...styles.tabActive, cursor: "default" }}>
              JIRA
              <span style={styles.tabCount}>
                {jiraData?.tickets.length ?? 0}
              </span>
            </div>
            {jiraData?.sprintName && (
              <span style={styles.sprintBadge}>{jiraData.sprintName}</span>
            )}
          </div>

          <div style={styles.listContainer}>
            {jiraLoading && (
              <div style={styles.empty}>
                <div style={styles.spinner} />
                <p style={styles.emptyText}>Fetching from Jira...</p>
              </div>
            )}

            {jiraError && (
              <div style={styles.empty}>
                <p style={styles.errorText}>{jiraError.includes("ECONNREFUSED") || jiraError.includes("localhost") ? "Jira MCP server offline. Start Docker container on :8080." : jiraError}</p>
              </div>
            )}

            {!jiraLoading && !jiraError && jiraData && (
              jiraData.tickets.length === 0 ? (
                <EmptyState label="No active sprint tickets" />
              ) : (
                jiraData.tickets.map((ticket) => (
                  <JiraTicketCard key={ticket.id ?? ticket.key} ticket={ticket} />
                ))
              )
            )}
          </div>
        </section>

        {/* ── Right panel: voice control ── */}
        <section style={styles.voicePanel}>
          <div style={styles.voicePanelInner}>
            <p style={styles.voiceLabel}>VOICE CONTROL</p>

            {/* Briefing button */}
            <button
              style={{
                ...styles.briefingBtn,
                ...(briefingPlaying ? styles.briefingBtnActive : {}),
              }}
              onClick={playBriefing}
              disabled={briefingPlaying}
            >
              <span style={styles.briefingIcon}>▶</span>
              {briefingPlaying ? "PLAYING BRIEFING..." : "PLAY BRIEFING"}
            </button>

            {/* Mic button */}
            <button
              style={{
                ...styles.micBtn,
                ...(voiceState === "recording" ? styles.micBtnRecording : {}),
                ...(voiceState === "processing" ? styles.micBtnProcessing : {}),
              }}
              onClick={handleMicClick}
              disabled={voiceState === "processing"}
            >
              {voiceState === "recording" && <div style={styles.micRing} />}
              <span style={styles.micIcon}>
                {voiceState === "processing" ? "⟳" : "🎤"}
              </span>
            </button>

            <p style={styles.micHint}>
              {voiceState === "idle" && "TAP TO SPEAK"}
              {voiceState === "recording" && "LISTENING — TAP TO STOP"}
              {voiceState === "processing" && "TRANSCRIBING..."}
            </p>

            {/* Transcript box */}
            <div style={styles.transcriptBox}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ ...styles.transcriptLabel, margin: 0 }}>TRANSCRIPT</p>
                {voiceRoute && (
                  <span style={{
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    padding: "2px 6px",
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: voiceRoute === "jira" ? C.amber : voiceRoute === "github" ? C.green : voiceRoute === "clarify" ? "#58a6ff" : C.red,
                    color: voiceRoute === "jira" ? C.amber : voiceRoute === "github" ? C.green : voiceRoute === "clarify" ? "#58a6ff" : C.red,
                  }}>
                    {voiceRoute.toUpperCase()}
                  </span>
                )}
              </div>
              <p style={styles.transcriptText}>
                {transcript || "Transcript will appear here..."}
              </p>
            </div>

            {/* Divider */}
            <div style={styles.divider} />

            {/* Stale warning */}
            {staleCount > 0 && (
              <div style={styles.staleAlert}>
                <span style={styles.staleAlertDot} />
                <p style={styles.staleAlertText}>
                  {staleCount} ticket{staleCount > 1 ? "s" : ""} stale (&gt;7d)
                </p>
              </div>
            )}

            <p style={styles.footer}>
              Pulse v2 · GitHub MCP · Jira MCP · Deepgram STT/TTS
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statValue, ...(accent ? styles.statAccent : {}) }}>
        {value}
      </span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const date = issue.updated_at ?? issue.updatedAt;
  const stale = isStale(date);
  const url = issue.html_url ?? issue.url ?? "#";
  return (
    <a href={url} target="_blank" rel="noreferrer" style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardNumber}>#{issue.number}</span>
        {stale && <span style={styles.staleBadge}>STALE</span>}
      </div>
      <p style={styles.cardTitle}>{issue.title}</p>
      <div style={styles.cardMeta}>
        {issue.user?.login && (
          <span style={styles.metaItem}>{issue.user.login}</span>
        )}
        <span style={styles.metaItem}>{timeAgo(date)}</span>
        {issue.labels?.map((l) => (
          <span
            key={l.name}
            style={{
              ...styles.label,
              borderColor: l.color ? `#${l.color}` : "#333",
              color: l.color ? `#${l.color}` : "#888",
            }}
          >
            {l.name}
          </span>
        ))}
      </div>
    </a>
  );
}

function PRCard({ pr }: { pr: PR }) {
  return (
    <a
      href={pr.html_url ?? "#"}
      target="_blank"
      rel="noreferrer"
      style={styles.card}
    >
      <div style={styles.cardHeader}>
        <span style={styles.cardNumber}>#{pr.number}</span>
        <span
          style={{
            ...styles.stateBadge,
            background: pr.state === "open" ? "#1a3a1a" : "#2a1a1a",
            color: pr.state === "open" ? "#4caf50" : "#ef5350",
          }}
        >
          {pr.state?.toUpperCase()}
        </span>
      </div>
      <p style={styles.cardTitle}>{pr.title}</p>
      <div style={styles.cardMeta}>
        {pr.user?.login && (
          <span style={styles.metaItem}>{pr.user.login}</span>
        )}
        <span style={styles.metaItem}>{timeAgo(pr.updated_at)}</span>
      </div>
    </a>
  );
}

function CommitCard({ commit }: { commit: Commit }) {
  const msg = commit.commit?.message?.split("\n")[0] ?? "No message";
  const author = commit.commit?.author?.name ?? "Unknown";
  const date = commit.commit?.author?.date;
  return (
    <a
      href={commit.html_url ?? "#"}
      target="_blank"
      rel="noreferrer"
      style={styles.card}
    >
      <div style={styles.cardHeader}>
        <span style={styles.cardNumber}>{commit.sha?.slice(0, 7)}</span>
      </div>
      <p style={styles.cardTitle}>{msg}</p>
      <div style={styles.cardMeta}>
        <span style={styles.metaItem}>{author}</span>
        <span style={styles.metaItem}>{timeAgo(date)}</span>
      </div>
    </a>
  );
}

function daysOpen(dateStr?: string): string {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "opened today";
  if (days === 1) return "1d open";
  return `${days}d open`;
}

function JiraTicketCard({ ticket }: { ticket: JiraTicket }) {
  const summary = ticket.summary ?? "Untitled";
  const status = ticket.status?.name ?? "Unknown";
  const issueType = ticket.issue_type?.name;
  const priority = ticket.priority?.name;
  const assignee = ticket.assignee?.display_name;
  const reporter = ticket.reporter?.display_name;
  const updated = ticket.updated;
  const created = ticket.created;

  const statusColor = (() => {
    const color = ticket.status?.color ?? "";
    const cat = ticket.status?.category ?? "";
    if (color === "green" || cat === "Done") return C.green;
    if (color === "yellow" || cat === "In Progress") return C.amber;
    return C.muted;
  })();

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.jiraKey}>{ticket.key}</span>
        {issueType && <span style={styles.jiraType}>{issueType.toUpperCase()}</span>}
        {priority && (
          <span style={{
            ...styles.jiraPriority,
            color: priority === "High" || priority === "Highest" ? C.red : C.muted,
          }}>
            {priority === "Highest" ? "▲▲" : priority === "High" ? "▲" : priority === "Low" ? "▼" : "●"} {priority}
          </span>
        )}
      </div>
      <p style={styles.cardTitle}>{summary}</p>
      <div style={styles.cardMeta}>
        <span style={{ ...styles.jiraStatus, color: statusColor, borderColor: statusColor }}>
          {status}
        </span>
        {created && <span style={styles.metaItem}>{daysOpen(created)}</span>}
        {assignee && assignee !== "Unassigned" && <span style={styles.metaItem}>{assignee}</span>}
        {(!assignee || assignee === "Unassigned") && reporter && (
          <span style={styles.metaItem}>{reporter}</span>
        )}
        {updated && <span style={styles.metaItem}>upd {timeAgo(updated)}</span>}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={styles.empty}>
      <p style={styles.emptyText}>{label}</p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#07090f",
  surface: "#0d1117",
  card: "#111820",
  border: "#1e2530",
  amber: "#f0a500",
  amberDim: "#7a5200",
  green: "#3fb950",
  red: "#f85149",
  text: "#cdd9e5",
  muted: "#545d68",
  mono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: C.mono,
    position: "relative",
    overflow: "hidden",
  },
  gridOverlay: {
    position: "fixed",
    inset: 0,
    backgroundImage: `linear-gradient(${C.border} 1px, transparent 1px), linear-gradient(90deg, ${C.border} 1px, transparent 1px)`,
    backgroundSize: "40px 40px",
    opacity: 0.3,
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 32px",
    borderBottom: `1px solid ${C.border}`,
    background: `${C.surface}cc`,
    backdropFilter: "blur(12px)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  pulseIcon: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: `2px solid ${C.amber}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: `0 0 16px ${C.amber}44`,
  },
  pulseDot: {
    display: "block",
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: C.amber,
    boxShadow: `0 0 8px ${C.amber}`,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "0.2em",
    color: C.amber,
  },
  subtitle: {
    margin: 0,
    fontSize: 11,
    color: C.muted,
    letterSpacing: "0.1em",
    marginTop: 2,
  },
  headerStats: {
    display: "flex",
    gap: 32,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: C.text,
  },
  statAccent: {
    color: C.red,
    textShadow: `0 0 8px ${C.red}88`,
  },
  statLabel: {
    fontSize: 10,
    color: C.muted,
    letterSpacing: "0.15em",
  },
  main: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 320px",
    gap: 0,
    height: "calc(100vh - 85px)",
  },
  panel: {
    borderRight: `1px solid ${C.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    borderBottom: `1px solid ${C.border}`,
    background: C.surface,
  },
  tab: {
    padding: "12px 20px",
    fontSize: 11,
    letterSpacing: "0.15em",
    fontFamily: C.mono,
    fontWeight: 600,
    background: "transparent",
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    borderBottom: "2px solid transparent",
    color: C.muted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "color 0.15s",
  },
  tabActive: {
    color: C.amber,
    borderBottom: `2px solid ${C.amber}`,
  },
  tabCount: {
    background: C.border,
    color: C.muted,
    borderRadius: 10,
    padding: "1px 6px",
    fontSize: 10,
  },
  listContainer: {
    flex: 1,
    overflowY: "auto",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  card: {
    display: "block",
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "12px 16px",
    textDecoration: "none",
    color: "inherit",
    transition: "border-color 0.15s, background 0.15s",
    cursor: "pointer",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  cardNumber: {
    fontSize: 11,
    color: C.muted,
    letterSpacing: "0.05em",
  },
  cardTitle: {
    margin: 0,
    fontSize: 13,
    color: C.text,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  cardMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  metaItem: {
    fontSize: 11,
    color: C.muted,
  },
  label: {
    fontSize: 10,
    border: "1px solid",
    borderRadius: 3,
    padding: "1px 6px",
    letterSpacing: "0.05em",
  },
  staleBadge: {
    fontSize: 10,
    background: "#2a1a00",
    color: C.amber,
    border: `1px solid ${C.amberDim}`,
    borderRadius: 3,
    padding: "1px 6px",
    letterSpacing: "0.1em",
  },
  stateBadge: {
    fontSize: 10,
    borderRadius: 3,
    padding: "1px 6px",
    letterSpacing: "0.1em",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 40,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
    margin: 0,
    letterSpacing: "0.05em",
  },
  spinner: {
    width: 32,
    height: 32,
    border: `2px solid ${C.border}`,
    borderTop: `2px solid ${C.amber}`,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorText: {
    color: C.red,
    fontSize: 12,
    padding: 16,
  },
  voicePanel: {
    background: C.surface,
    overflowY: "auto",
  },
  voicePanelInner: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
  },
  voiceLabel: {
    margin: 0,
    fontSize: 10,
    letterSpacing: "0.2em",
    color: C.muted,
    alignSelf: "flex-start",
  },
  briefingBtn: {
    width: "100%",
    padding: "12px 0",
    background: "transparent",
    border: `1px solid ${C.amber}`,
    color: C.amber,
    fontSize: 12,
    letterSpacing: "0.15em",
    fontFamily: C.mono,
    fontWeight: 600,
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "background 0.15s",
  },
  briefingBtnActive: {
    background: `${C.amber}18`,
    cursor: "not-allowed",
  },
  briefingIcon: {
    fontSize: 14,
  },
  micBtn: {
    position: "relative",
    width: 88,
    height: 88,
    borderRadius: "50%",
    background: C.card,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: C.border,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "border-color 0.2s, box-shadow 0.2s",
    marginTop: 8,
  },
  micBtnRecording: {
    borderColor: C.red,
    boxShadow: `0 0 24px ${C.red}66`,
    background: "#1a0808",
  },
  micBtnProcessing: {
    borderColor: C.amber,
    boxShadow: `0 0 16px ${C.amber}44`,
    cursor: "not-allowed",
  },
  micRing: {
    position: "absolute",
    inset: -8,
    borderRadius: "50%",
    border: `1px solid ${C.red}`,
    opacity: 0.5,
    animation: "pulseRing 1.2s ease-out infinite",
  },
  micIcon: {
    fontSize: 28,
    userSelect: "none",
  },
  micHint: {
    margin: 0,
    fontSize: 10,
    letterSpacing: "0.15em",
    color: C.muted,
  },
  transcriptBox: {
    width: "100%",
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 14,
    minHeight: 100,
  },
  transcriptLabel: {
    margin: 0,
    fontSize: 9,
    letterSpacing: "0.2em",
    color: C.muted,
    marginBottom: 8,
  },
  transcriptText: {
    margin: 0,
    fontSize: 12,
    color: C.text,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  divider: {
    width: "100%",
    height: 1,
    background: C.border,
  },
  staleAlert: {
    width: "100%",
    background: "#1a0e00",
    border: `1px solid ${C.amberDim}`,
    borderRadius: 4,
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  staleAlertDot: {
    display: "block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: C.amber,
    flexShrink: 0,
  },
  staleAlertText: {
    margin: 0,
    fontSize: 11,
    color: C.amber,
    letterSpacing: "0.05em",
  },
  footer: {
    margin: 0,
    fontSize: 10,
    color: C.muted,
    letterSpacing: "0.08em",
    textAlign: "center",
  },
  sprintBadge: {
    fontSize: 10,
    color: C.amber,
    letterSpacing: "0.08em",
    padding: "0 12px",
    display: "flex",
    alignItems: "center",
    opacity: 0.8,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: 180,
  },
  jiraKey: {
    fontSize: 11,
    color: C.amber,
    letterSpacing: "0.05em",
    fontWeight: 600,
  },
  jiraType: {
    fontSize: 9,
    color: C.muted,
    letterSpacing: "0.1em",
    background: C.border,
    borderRadius: 3,
    padding: "1px 5px",
  },
  jiraPriority: {
    fontSize: 10,
    letterSpacing: "0.05em",
    marginLeft: "auto",
  },
  jiraStatus: {
    fontSize: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 3,
    padding: "1px 6px",
    letterSpacing: "0.08em",
  },
};