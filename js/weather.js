// Local weather outlook via Open-Meteo (free, keyless). Fetched only for the
// next-launch hero card and the open mission-details modal — never for every
// card. Responses are cached in sessionStorage (~15 min) and identical in-flight
// requests are de-duplicated. This module is self-contained: it imports only
// config and manages its own guarded cache. Fetching/cancellation is driven by
// main.js; render.js imports only the pure formatting helpers.

import {
  OPEN_METEO_URL,
  WEATHER_TTL_MS,
  WEATHER_FORECAST_DAYS,
  STORAGE_KEYS
} from "./config.js";

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

// WMO weather interpretation codes → short human label.
const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

export function weatherCodeLabel(code) {
  return WEATHER_CODES[code] ?? "Unknown conditions";
}

// Format an Open-Meteo Celsius temperature for display as Fahrenheit first,
// then Celsius (e.g. "73°F / 23°C"). Returns null when no value is available so
// callers can render a graceful placeholder. Centralizes the C→F conversion so
// rendering code never duplicates it.
export function formatTemperature(celsius) {
  if (celsius === null || celsius === undefined) return null;
  const c = Number(celsius);
  if (Number.isNaN(c)) return null;
  const roundedC = Math.round(c);
  const roundedF = Math.round((c * 9) / 5 + 32);
  return { c: roundedC, f: roundedF, text: `${roundedF}°F / ${roundedC}°C` };
}

// In-memory de-dupe of concurrent requests for the same cache key.
const inflight = new Map();

function cacheKey(lat, lon, launchMs) {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${Math.round(launchMs / HOUR_MS)}`;
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.weather);
    if (!raw) return null;
    const map = JSON.parse(raw);
    if (!map || typeof map !== "object") return null;
    const entry = map[key];
    if (!entry || typeof entry !== "object") return null;
    if (Date.now() - Number(entry.savedAt || 0) > WEATHER_TTL_MS) return null;
    return entry.data || null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.weather);
    let map = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") map = parsed;
    }
    // Drop expired entries so the blob can't grow without bound.
    const now = Date.now();
    for (const k of Object.keys(map)) {
      if (now - Number(map[k]?.savedAt || 0) > WEATHER_TTL_MS) delete map[k];
    }
    map[key] = { savedAt: now, data };
    sessionStorage.setItem(STORAGE_KEYS.weather, JSON.stringify(map));
  } catch {
    // Caching is best-effort; ignore quota/serialization failures.
  }
}

// Choose the hourly record nearest to the scheduled launch time.
function pickNearestHour(hourly, launchMs) {
  const times = hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return -1;
  const targetSec = Math.round(launchMs / 1000);
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i += 1) {
    const diff = Math.abs(Number(times[i]) - targetSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

async function fetchWeather(lat, lon, launchMs, signal, key) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly:
      "temperature_2m,precipitation_probability,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m",
    timezone: "auto",
    forecast_days: String(WEATHER_FORECAST_DAYS),
    timeformat: "unixtime"
  });

  const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, { signal });
  if (!response.ok) return { status: "error" };

  const json = await response.json();
  const hourly = json?.hourly;
  const idx = pickNearestHour(hourly, launchMs);
  if (idx < 0) return { status: "error" };

  const at = (arr) => (Array.isArray(arr) ? arr[idx] : null);
  const data = {
    time: Number(hourly.time[idx]) * 1000,
    temperature: at(hourly.temperature_2m),
    precipitationProbability: at(hourly.precipitation_probability),
    weatherCode: at(hourly.weather_code),
    cloudCover: at(hourly.cloud_cover),
    visibility: at(hourly.visibility),
    windSpeed: at(hourly.wind_speed_10m),
    windGusts: at(hourly.wind_gusts_10m),
    units: json?.hourly_units || {}
  };

  writeCache(key, data);
  return { status: "ok", data };
}

// Resolve a weather outlook for a launch. Returns a status object the UI can
// render directly. Throws only on AbortError (so callers can ignore stale
// requests); all other failures resolve to { status: "error" }.
export async function getWeatherForLaunch(launch, { signal } = {}) {
  const lat = launch?.padLat;
  const lon = launch?.padLon;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return { status: "unavailable-coords" };
  }

  const launchMs = new Date(launch?.net).getTime();
  if (!launch?.net || Number.isNaN(launchMs)) {
    return { status: "invalid-time" };
  }

  if (launchMs - Date.now() > WEATHER_FORECAST_DAYS * DAY_MS) {
    return { status: "beyond-horizon" };
  }

  const key = cacheKey(lat, lon, launchMs);
  const cached = readCache(key);
  if (cached) return { status: "ok", data: cached, cached: true };

  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      return await fetchWeather(lat, lon, launchMs, signal, key);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { status: "error" };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
