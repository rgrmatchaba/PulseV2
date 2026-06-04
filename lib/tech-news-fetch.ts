export type TechHeadline = {
  title: string;
  source: string;
};

const HN_FRONT_PAGE =
  "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=4";

function sourceFromUrl(url?: string): string {
  if (!url) return "Hacker News";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Hacker News";
  }
}

export async function fetchTechHeadlines(): Promise<TechHeadline[]> {
  const res = await fetch(HN_FRONT_PAGE, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Tech news fetch failed: ${res.status}`);

  const json = await res.json();
  const hits = (json.hits ?? []) as Array<{ title?: string; url?: string }>;

  return hits
    .filter((h) => h.title)
    .slice(0, 4)
    .map((h) => ({
      title: h.title as string,
      source: sourceFromUrl(h.url),
    }));
}

export function formatTechHeadlinesForAgent(headlines: TechHeadline[]): string {
  if (headlines.length === 0) return "No tech headlines available.";
  return headlines.map((h, i) => `${i + 1}. ${h.title} (${h.source})`).join("\n");
}
