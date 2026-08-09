// Application-wide constants and configuration.

// ---- Launch Library 2 (LL2) ----------------------------------------------
// All values below were verified against the official LL2 2.3.0 documentation.
// SpaceX, Blue Origin, Rocket Lab, ULA, and Firefly are launch *providers*
// (lsp__id); NASA is a civil *agency* matched on the mission's agencies
// (mission__agency__ids). The app intentionally tracks only these organizations.
export const LL2_UPCOMING = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/";

// Verified provider / agency IDs (see docs links in the PR description).
export const SPACEX_PROVIDER_ID = 121;
export const BLUE_ORIGIN_PROVIDER_ID = 141;
export const ROCKET_LAB_PROVIDER_ID = 147;
export const ULA_PROVIDER_ID = 124; // United Launch Alliance
export const FIREFLY_PROVIDER_ID = 265; // Firefly Aerospace
export const NASA_AGENCY_ID = 44;

// Every tracked provider id, in the order used for the combined feed.
export const PROVIDER_IDS = [
  SPACEX_PROVIDER_ID,
  BLUE_ORIGIN_PROVIDER_ID,
  ROCKET_LAB_PROVIDER_ID,
  ULA_PROVIDER_ID,
  FIREFLY_PROVIDER_ID
];

// LL2 caps `limit` at 100 records per request, so a feed with more upcoming
// launches than that has to be paged. We follow at most one extra page per
// feed, which covers up to 200 launches while keeping a full load to three
// requests at worst — comfortably inside LL2's 15-per-hour budget.
export const FEED_PAGE_SIZE = 100;
export const FEED_MAX_PAGES = 2;

// Feed A — all tracked provider launches (orbital + suborbital so New Shepard
// flights are not missed). A single request covers every provider because
// LL2 2.3.0 lsp__id accepts comma-separated values.
export const API_PROVIDERS =
  `${LL2_UPCOMING}?lsp__id=${PROVIDER_IDS.join(",")}` +
  `&include_suborbital=true&mode=detailed&limit=${FEED_PAGE_SIZE}&ordering=net&hide_recent_previous=true`;

// Feed C (lazy) — recently completed launches from the tracked providers, used
// by the "Previous launches" panel. Only requested when the user opens that
// panel, so it costs nothing on a normal visit and stays inside LL2's budget.
export const LL2_PREVIOUS = "https://ll.thespacedevs.com/2.3.0/launches/previous/";
// How many completed launches the panel keeps. The store is a rolling window:
// when a newer launch arrives the oldest entry falls out, taking its recorded
// weather with it, so the saved payload can never grow.
export const PREVIOUS_LIMIT = 20;

export const API_PREVIOUS =
  `${LL2_PREVIOUS}?lsp__id=${PROVIDER_IDS.join(",")}` +
  `&include_suborbital=true&mode=detailed&limit=${PREVIOUS_LIMIT}&ordering=-net`;

// How long the previous-launch list stays fresh before the panel refetches.
export const PREVIOUS_TTL_MS = 1000 * 60 * 30;

// Open-Meteo serves past hours from the same keyless forecast endpoint for
// roughly the last 92 days. Older launches honestly report no recorded weather
// rather than guessing.
export const RECORDED_WEATHER_DAYS = 92;

// Feed B — NASA-tagged missions (may fly on providers other than the tracked
// ones; that provider is shown only as secondary metadata, never as a tab).
export const API_NASA =
  `${LL2_UPCOMING}?mission__agency__ids=${NASA_AGENCY_ID}` +
  `&mode=detailed&limit=${FEED_PAGE_SIZE}&ordering=net&hide_recent_previous=true`;

// Open-Meteo free, keyless forecast endpoint (no signup, no API key).
export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

// Keys used for localStorage (prefs, favorites, manifest cache) and
// sessionStorage (weather cache). Renamed for the U.S. Space Mission Control
// rebrand; a one-time migration in storage.js copies data forward from the old
// spacex-mission-control-* keys.
export const STORAGE_KEYS = {
  favorites: "us-space-mission-control-favorites",
  prefs: "us-space-mission-control-prefs",
  // v3.3: the normalized live manifest is cached in localStorage (cross-visit,
  // schema-versioned) for cache-first rendering.
  manifest: "us-space-mission-control-manifest",
  weather: "us-space-mission-control-weather-v1",
  // Rolling window of the most recent completed launches, plus any recorded
  // weather already fetched for them. Lives in localStorage so the recorded
  // outlook is paid for once, not once per visit.
  previous: "us-space-mission-control-previous-v2"
};

// Schema version for the cached manifest payload. Bump when the normalized
// launch shape changes so old caches are ignored safely.
export const MANIFEST_CACHE_SCHEMA = 1;

// Cache-first freshness model:
//   fresh   : < 15 min  — render immediately, refresh quietly in the background
//   stale   : 15 min – 24 h — render immediately with an honest "from N ago" note
//   expired : > 24 h    — never presented as current; reload fresh first
export const CACHE_FRESH_MS = 1000 * 60 * 15;
export const CACHE_STALE_MS = 1000 * 60 * 60 * 24;

// Abort a live request that takes longer than this so the UI can fall back to
// cache/demo instead of hanging.
export const NETWORK_TIMEOUT_MS = 1000 * 15;

// Legacy keys to migrate from (read once, never written back).
export const LEGACY_STORAGE_KEYS = {
  favorites: "spacex-mission-control-favorites",
  prefs: "spacex-mission-control-prefs"
};

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
