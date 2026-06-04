"use client";

import { useEffect, useState } from "react";

export interface NewsStory {
  objectID: string;
  title: string;
  story_text?: string;
  url?: string;
  num_words?: number;
}

export type NewsState =
  | { status: "loading" }
  | { status: "ok"; stories: NewsStory[] }
  | { status: "error" };

const HN_URL =
  "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&query=AI";

export function useNews(): NewsState {
  const [state, setState] = useState<NewsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(HN_URL)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const hits: NewsStory[] = (json.hits ?? []).slice(0, 3);
        setState({ status: "ok", stories: hits });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
