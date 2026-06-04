export type TimeTheme = "morning" | "afternoon" | "evening";

export function getThemeFromHour(hour: number): TimeTheme {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** Spoken opening line for landing / morning ritual. */
export function getLandingGreeting(name: string, hour = new Date().getHours()): string {
  const theme = getThemeFromHour(hour);
  if (theme === "morning") return `Good morning, ${name}.`;
  if (theme === "afternoon") return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}
