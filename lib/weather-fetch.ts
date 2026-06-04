import { decodeWeatherCode } from "./weatherCodes";

const HARARE_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-17.8252&longitude=31.0335" +
  "&current=temperature_2m,weathercode,cloud_cover,wind_speed_10m,precipitation,is_day" +
  "&daily=sunshine_duration,precipitation_sum,wind_speed_10m_max" +
  "&timezone=Africa/Harare";

export type WeatherBrief = {
  location: string;
  temperatureC: number;
  description: string;
  cloudCoverPercent: number;
  windSpeedKmh: number;
  precipitationMm: number;
  isDay: boolean;
  sunshineHoursToday: number | null;
  dailyPrecipitationMm: number | null;
  summaryForAgent: string;
};

export async function fetchWeatherBrief(): Promise<WeatherBrief> {
  const res = await fetch(HARARE_FORECAST_URL, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);

  const json = await res.json();
  const cur = json.current ?? {};
  const daily = json.daily ?? {};

  const temp = Math.round(cur.temperature_2m ?? 0);
  const code = cur.weathercode ?? 0;
  const { description } = decodeWeatherCode(code);
  const cloud = Math.round(cur.cloud_cover ?? 0);
  const wind = Math.round(cur.wind_speed_10m ?? 0);
  const precip = cur.precipitation ?? 0;
  const sunshineSec = daily.sunshine_duration?.[0] as number | undefined;
  const sunshineHours =
    sunshineSec != null ? Math.round((sunshineSec / 3600) * 10) / 10 : null;
  const dailyPrecip = daily.precipitation_sum?.[0] as number | undefined;

  const summaryForAgent = [
    `Location: Harare, Zimbabwe`,
    `Temperature: ${temp}°C`,
    `Conditions: ${description}`,
    `Cloud cover: ${cloud}%`,
    `Wind: ${wind} km/h`,
    `Current precipitation: ${precip} mm`,
    cur.is_day === 1 ? "Daytime" : "Nighttime",
    sunshineHours != null ? `Sunshine expected today: ~${sunshineHours} hours` : null,
    dailyPrecip != null && dailyPrecip > 0
      ? `Daily precipitation total: ${dailyPrecip} mm`
      : "No significant rain accumulation expected today",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    location: "Harare, ZW",
    temperatureC: temp,
    description,
    cloudCoverPercent: cloud,
    windSpeedKmh: wind,
    precipitationMm: precip,
    isDay: cur.is_day === 1,
    sunshineHoursToday: sunshineHours,
    dailyPrecipitationMm: dailyPrecip ?? null,
    summaryForAgent,
  };
}
