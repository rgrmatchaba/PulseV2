"use client";

import { useEffect, useState } from "react";
import { getThemeFromHour, type TimeTheme } from "@/lib/time-theme";

export type { TimeTheme };

export function useTimeTheme(): TimeTheme {
  const [theme, setTheme] = useState<TimeTheme>("morning");

  useEffect(() => {
    const computed = getThemeFromHour(new Date().getHours());
    setTheme(computed);
    document.documentElement.setAttribute("data-theme", computed);
    console.log("[Pulse] time theme:", computed);
  }, []);

  return theme;
}
