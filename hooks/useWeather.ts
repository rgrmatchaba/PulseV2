"use client";

import { useEffect, useState } from "react";
import { decodeWeatherCode } from "@/lib/weatherCodes";

export interface WeatherData {
  temperature: number;
  description: string;
  oneLiner: string;
}

export type WeatherState =
  | { status: "loading" }
  | { status: "ok"; data: WeatherData }
  | { status: "error" };

const HARARE_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-17.8252&longitude=31.0335&current=temperature_2m,weathercode&timezone=Africa/Harare";

export function useWeather(): WeatherState {
  const [state, setState] = useState<WeatherState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(HARARE_URL)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const temp = Math.round(json.current?.temperature_2m ?? 0);
        const code = json.current?.weathercode ?? 0;
        const { description, oneLiner } = decodeWeatherCode(code);
        setState({ status: "ok", data: { temperature: temp, description, oneLiner } });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
