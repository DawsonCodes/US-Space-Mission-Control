// Application-wide constants and configuration.

// Launch Library 2 endpoint for upcoming SpaceX launches.
export const API_UPCOMING =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?lsp__name=SpaceX&limit=100&mode=detailed&ordering=net&hide_recent_previous=true";

// Open-Meteo free, keyless forecast endpoint (no signup, no API key).
export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Keys used for localStorage (prefs, favorites) and sessionStorage (caches).
export const STORAGE_KEYS = {
  favorites: "spacex-mission-control-favorites",
  prefs: "spacex-mission-control-prefs",
  cache: "spacex-mission-control-cache-v2",
  weather: "spacex-mission-control-weather-v1"
};

// How long a cached launch API response stays fresh (5 minutes).
export const CACHE_TTL_MS = 1000 * 60 * 5;

// How long a cached weather response stays fresh (~15 minutes).
export const WEATHER_TTL_MS = 1000 * 60 * 15;

// Open-Meteo only forecasts ~16 days out; beyond that we show a friendly note.
export const WEATHER_FORECAST_DAYS = 16;

// Progressive-reveal: how many cards are visible initially and per "Load more".
export const DEFAULT_VISIBLE = 12;
export const LOAD_MORE_STEP = 12;

// Hosts whose URLs are API endpoints, never public-facing mission pages.
// Used to keep Launch Library REST/object URLs out of "Official page" actions.
export const API_URL_HOSTS = ["ll.thespacedevs.com", "lldev.thespacedevs.com"];
