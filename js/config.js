// Application-wide constants and configuration.

// Launch Library 2 endpoint for upcoming SpaceX launches.
export const API_UPCOMING =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?lsp__name=SpaceX&limit=100&mode=detailed&ordering=net&hide_recent_previous=true";

// Keys used for localStorage (prefs, favorites) and sessionStorage (cache).
export const STORAGE_KEYS = {
  favorites: "spacex-mission-control-favorites",
  prefs: "spacex-mission-control-prefs",
  cache: "spacex-mission-control-cache-v2"
};

// How long a cached API response stays fresh (5 minutes).
export const CACHE_TTL_MS = 1000 * 60 * 5;

// Default result limit used by the filters and the reset action.
export const DEFAULT_LIMIT = 12;
