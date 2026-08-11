// Application-wide constants and configuration.

// ---- Launch Library 2 (LL2) ----------------------------------------------
// All values below were verified against the official LL2 2.3.0 documentation.
// SpaceX, Blue Origin, Rocket Lab, ULA, and Firefly are launch *providers*
// (lsp__id); NASA is a civil *agency* matched on the mission's agencies
// (mission__agency__ids). The app intentionally tracks only these organizations.
export const LL2_BASE = "https://ll.thespacedevs.com/2.3.0";
export const LL2_UPCOMING = `${LL2_BASE}/launches/upcoming/`;

// The Space Devs also run a development mirror at lldev, which they ask people
// to use for building and testing so the production API is not hammered. It has
// a far looser rate limit, and in exchange it serves a cached dataset that can
// be out of date. That trade is exactly right for a debug switch and exactly
// wrong for the real dashboard, so it is only ever used deliberately: never as
// the normal source, and always labelled when shown.
export const LL2_DEV_BASE = "https://lldev.thespacedevs.com/2.3.0";

// Swap a production LL2 URL onto the development mirror, keeping the path and
// every query parameter identical.
export function toDevEndpoint(url) {
  return String(url).replace(LL2_BASE, LL2_DEV_BASE);
}

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

// ---- Snapshot (the normal source of data) --------------------------------
// A scheduled workflow calls LL2 twice an hour and commits the result to the
// repository as plain JSON. The dashboard loads that file from its own origin,
// so a visitor makes no Launch Library request, cannot be rate limited, and
// sees the same complete list as everybody else. Relative paths keep this
// working under the GitHub Pages project subpath.
export const SNAPSHOT_LAUNCHES = "data/launches.json";
export const SNAPSHOT_PREVIOUS = "data/previous.json";

// Bump when the snapshot shape changes so an old committed file is ignored.
export const SNAPSHOT_SCHEMA = 1;

// How often the page re-reads the snapshot while a tab is open. Matched to the
// workflow's half-hourly schedule, and cheap either way: it is a static file on
// the same origin, not an API call.
export const AUTO_REFRESH_MS = 1000 * 60 * 30;

// A snapshot older than this means the workflow has stopped running, so the
// dashboard falls back to calling LL2 directly rather than quietly serving
// stale data. Three hours is six missed runs.
export const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 3;

// When there is no published snapshot at all, the API is the only source, and
// it has a per-browser budget. Reloading is free either way; the API is only
// worth spending once what we are showing is genuinely this old. That caps the
// fallback at roughly one request an hour instead of two or three per reload.
export const API_FALLBACK_MIN_AGE_MS = 1000 * 60 * 60;

// ---- Direct LL2 access (fallback only) -----------------------------------
// LL2 caps `limit` at 100 records per request, so a feed with more upcoming
// launches than that has to be paged. In the browser fallback we follow at most
// one extra page to stay inside the 15-per-hour budget. The workflow has no such
// pressure and pages much further; see WORKFLOW_MAX_PAGES.
export const FEED_PAGE_SIZE = 100;
export const FEED_MAX_PAGES = 2;

// The scheduled workflow runs twice an hour from a CI runner, so it can afford
// to page until the feed is exhausted. Bounded anyway so a misreported count
// cannot loop.
export const WORKFLOW_MAX_PAGES = 8;

// ...but not past the hourly allowance. Two runs an hour against LL2's 15 leaves
// seven requests per run, so a growing schedule cannot quietly push the workflow
// over the limit. When the budget runs out the feed is reported as truncated
// rather than silently short.
export const WORKFLOW_REQUEST_BUDGET = 7;
export const LL2_HOURLY_BUDGET = 15;
export const WORKFLOW_RUNS_PER_HOUR = 2;

// Feed A — all tracked provider launches (orbital + suborbital so New Shepard
// flights are not missed). A single request covers every provider because
// LL2 2.3.0 lsp__id accepts comma-separated values.
export const API_PROVIDERS =
  `${LL2_UPCOMING}?lsp__id=${PROVIDER_IDS.join(",")}` +
  `&include_suborbital=true&mode=detailed&limit=${FEED_PAGE_SIZE}&ordering=net&hide_recent_previous=true`;

// The workflow retries a feed that fails or is refused, since one bad response
// on a CI runner should not leave every visitor with a partial list for the
// next half hour.
export const WORKFLOW_RETRIES = 3;
export const WORKFLOW_RETRY_BASE_MS = 5000;
// Spacing between the workflow's own requests, so a full page sweep stays a
// polite caller rather than a burst.
export const WORKFLOW_REQUEST_GAP_MS = 1500;

// Feed C (lazy) — recently completed launches from the tracked providers, used
// by the "Previous launches" panel. Only requested when the user opens that
// panel, so it costs nothing on a normal visit and stays inside LL2's budget.
export const LL2_PREVIOUS = `${LL2_BASE}/launches/previous/`;
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
  previous: "us-space-mission-control-previous-v2",
  // When LL2 last rate-limited us, so a reload doesn't immediately retry.
  cooldown: "us-space-mission-control-ll2-cooldown"
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

// The Debug switch is an interaction, not a page load: waiting out the full
// network timeout felt like the button had done nothing at all. It gives up
// quickly and falls back to the bundled sample missions instead.
export const DEBUG_TIMEOUT_MS = 1000 * 5;

// LL2 allows roughly 15 requests an hour to anonymous callers. When it answers
// 429 we stop asking for a while rather than spending every reload on a request
// that is going to be refused anyway.
export const RATE_LIMIT_COOLDOWN_MS = 1000 * 60 * 15;

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
