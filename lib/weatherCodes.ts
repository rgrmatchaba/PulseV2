const codeMap: Record<number, { description: string; group: "clear" | "cloudy" | "rain" | "storm" }> = {
  0:  { description: "Clear sky", group: "clear" },
  1:  { description: "Mainly clear", group: "clear" },
  2:  { description: "Partly cloudy", group: "cloudy" },
  3:  { description: "Overcast", group: "cloudy" },
  45: { description: "Foggy", group: "cloudy" },
  48: { description: "Depositing rime fog", group: "cloudy" },
  51: { description: "Light drizzle", group: "rain" },
  53: { description: "Moderate drizzle", group: "rain" },
  55: { description: "Dense drizzle", group: "rain" },
  61: { description: "Slight rain", group: "rain" },
  63: { description: "Moderate rain", group: "rain" },
  65: { description: "Heavy rain", group: "rain" },
  71: { description: "Slight snow", group: "rain" },
  73: { description: "Moderate snow", group: "rain" },
  75: { description: "Heavy snow", group: "rain" },
  77: { description: "Snow grains", group: "rain" },
  80: { description: "Slight showers", group: "rain" },
  81: { description: "Moderate showers", group: "rain" },
  82: { description: "Violent showers", group: "storm" },
  85: { description: "Slight snow showers", group: "rain" },
  86: { description: "Heavy snow showers", group: "storm" },
  95: { description: "Thunderstorm", group: "storm" },
  96: { description: "Thunderstorm with hail", group: "storm" },
  99: { description: "Thunderstorm with heavy hail", group: "storm" },
};

const oneLiners: Record<"clear" | "cloudy" | "rain" | "storm", string> = {
  clear: "Perfect day to ship something",
  cloudy: "Good focus weather",
  rain: "Stay in, stay productive",
  storm: "Maybe don't open Jira",
};

export function decodeWeatherCode(code: number): { description: string; oneLiner: string } {
  const entry = codeMap[code] ?? { description: "Unknown conditions", group: "clear" as const };
  return {
    description: entry.description,
    oneLiner: oneLiners[entry.group],
  };
}
