import { isInternalNarration } from "./task-requirements";

/** Remove Qwen-style reasoning blocks that must never be spoken or shown. */
export function stripModelThinking(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

export type SanitizeSpokenOptions = {
  /** Default 220 for action confirmations; use ~400 for summaries. */
  maxChars?: number;
};

/**
 * Strips URLs/markdown from agent replies before TTS and on-screen display.
 */
export function sanitizeSpokenReply(
  raw: string,
  opts: SanitizeSpokenOptions = {}
): string {
  const maxChars = opts.maxChars ?? 220;
  let text = stripModelThinking(raw).trim();
  if (isInternalNarration(text)) {
    return "Still on it — give me a second and ask again if the ticket didn't move.";
  }
  if (!text) return "Done.";

  // [label](url) — drop link-only labels; keep short descriptive labels
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, (_, label: string) => {
    const lower = label.toLowerCase();
    if (
      /view it here|click here|see it here|open (the )?link|here$/i.test(lower) ||
      lower.length < 3
    ) {
      return "";
    }
    return label;
  });

  // Bare URLs and www links
  text = text.replace(/https?:\/\/\S+/gi, "");
  text = text.replace(/\bwww\.\S+/gi, "");

  // Markdown emphasis / code
  text = text.replace(/[*_`#]/g, "");

  // Collapse whitespace and stray punctuation from removed links
  text = text.replace(/\s*—\s*—/g, " — ");
  text = text.replace(/\s*—\s*[.,!?]?\s*$/g, "");
  text = text.replace(/\s*—\s*\./g, ".");
  text = text.replace(/\s{2,}/g, " ");
  text = text.replace(/\s+([.,!?])/g, "$1");
  text = text.trim();

  if (!text) return "Done.";

  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastStop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? ")
    );
    text = lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…";
  }

  return text;
}
