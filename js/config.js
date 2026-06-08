// Application-wide constants and configuration.

// ---- Launch Library 2 (LL2) ----------------------------------------------
// All values below were verified against the official LL2 2.3.0 documentation.
// SpaceX and Blue Origin are launch *providers* (lsp__id); NASA is a civil
// *agency* matched on the mission's agencies (mission__agency__ids). The app
// intentionally tracks only these three organizations.
export const LL2_UPCOMING = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/";

// Verified provider / agency IDs (see docs links in the PR description).
export const SPACEX_PROVIDER_ID = 121;
export const BLUE_ORIGIN_PROVIDER_ID = 141;
export const NASA_AGENCY_ID = 44;

// Feed A — SpaceX + Blue Origin launches (orbital + suborbital so New Shepard
// flights are not missed). A single request covers both providers because
// lsp__id accepts comma-separated values.
export const API_PROVIDERS =
  `${LL2_UPCOMING}?lsp__id=${SPACEX_PROVIDER_ID},${BLUE_ORIGIN_PROVIDER_ID}` +
  "&include_suborbital=true&mode=detailed&limit=100&ordering=net&hide_recent_previous=true";

// Feed B — NASA-tagged missions (may fly on providers other than SpaceX/Blue
// Origin; that provider is shown only as secondary metadata, never as a tab).
export const API_NASA =
  `${LL2_UPCOMING}?mission__agency__ids=${NASA_AGENCY_ID}` +
  "&mode=detailed&limit=100&ordering=net&hide_recent_previous=true";

// Open-Meteo free, keyless forecast endpoint (no signup, no API key).
export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Keys used for localStorage (prefs, favorites) and sessionStorage (caches).
// Renamed for the U.S. Space Mission Control rebrand; a one-time migration in
// storage.js copies data forward from the old spacex-mission-control-* keys.
export const STORAGE_KEYS = {
  favorites: "us-space-mission-control-favorites",
  prefs: "us-space-mission-control-prefs",
  cache: "us-space-mission-control-cache-v3",
  weather: "us-space-mission-control-weather-v1"
};

// Legacy keys to migrate from (read once, never written back).
export const LEGACY_STORAGE_KEYS = {
  favorites: "spacex-mission-control-favorites",
  prefs: "spacex-mission-control-prefs"
};

// How long a cached launch API response stays fresh (10 minutes). Slightly
// longer than v2 so the two-feed refresh stays comfortably inside LL2's
// 15-requests/hour budget even with manual refreshes.
export const CACHE_TTL_MS = 1000 * 60 * 10;

// How long a cached weather response stays fresh (~15 minutes).
export const WEATHER_TTL_MS = 1000 * 60 * 15;

// Open-Meteo only forecasts ~16 days out; beyond that we show a friendly note.
export const WEATHER_FORECAST_DAYS = 16;

// Progressive-reveal: how many cards are visible initially and per "Load more".
export const DEFAULT_VISIBLE = 10;
export const LOAD_MORE_STEP = 10;

// Hosts whose URLs are API endpoints, never public-facing mission pages.
// Used to keep Launch Library REST/object URLs out of "Official page" actions.
export const API_URL_HOSTS = ["ll.thespacedevs.com", "lldev.thespacedevs.com"];
