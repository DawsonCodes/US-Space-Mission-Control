// Persistence layer: preferences and favorites in localStorage, and the live
// API response cache in sessionStorage. Every parse is guarded so corrupt
// storage never crashes the app. This module is intentionally render-free.

import {
  STORAGE_KEYS,
  LEGACY_STORAGE_KEYS,
  MANIFEST_CACHE_SCHEMA,
  CACHE_FRESH_MS,
  CACHE_STALE_MS
} from "./config.js";
import { state } from "./state.js";

const ORG_VALUES = new Set(["all", "nasa", "spacex", "blue-origin", "rocket-lab", "ula", "firefly"]);
const FLIGHT_VALUES = new Set(["all", "orbital", "suborbital"]);
const DATE_MODE_VALUES = new Set(["local", "utc", "site"]);
const DATE_RANGE_VALUES = new Set(["all", "24h", "7d", "30d", "year"]);
const LAUNCH_SITE_VALUES = new Set(["all", "cape-canaveral", "kennedy", "vandenberg", "wallops", "rocketlab-lc1", "other"]);
const ORBIT_VALUES = new Set(["all", "leo", "sso", "gto", "geo", "meo", "polar", "lunar", "interplanetary", "suborbital", "unknown"]);

// One-time migration from the old spacex-mission-control-* keys to the renamed
// us-space-mission-control-* keys. Runs before load; only copies forward when
// valid old data exists and the new key is not already set. Malformed legacy
// data is ignored safely and the new keys remain the source of truth.
export function migrateLegacyStorage() {
  try {
    if (!localStorage.getItem(STORAGE_KEYS.favorites)) {
      const oldFav = localStorage.getItem(LEGACY_STORAGE_KEYS.favorites);
      if (oldFav) {
        const parsed = JSON.parse(oldFav);
        if (Array.isArray(parsed)) {
          localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(parsed));
        }
      }
    }
  } catch {
    // ignore malformed legacy favorites
  }

  try {
    if (!localStorage.getItem(STORAGE_KEYS.prefs)) {
      const oldPrefs = localStorage.getItem(LEGACY_STORAGE_KEYS.prefs);
      if (oldPrefs) {
        const parsed = JSON.parse(oldPrefs);
        if (parsed && typeof parsed === "object") {
          localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(parsed));
        }
      }
    }
  } catch {
    // ignore malformed legacy prefs
  }
}

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prefs);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    if (DATE_MODE_VALUES.has(parsed.dateMode)) state.dateMode = parsed.dateMode;
    state.missionType = typeof parsed.missionType === "string" ? parsed.missionType : state.missionType;
    state.sortMode = typeof parsed.sortMode === "string" ? parsed.sortMode : state.sortMode;
    state.keyword = typeof parsed.keyword === "string" ? parsed.keyword : state.keyword;
    if (ORG_VALUES.has(parsed.activeOrg)) state.activeOrg = parsed.activeOrg;
    if (FLIGHT_VALUES.has(parsed.flightType)) state.flightType = parsed.flightType;
    if (DATE_RANGE_VALUES.has(parsed.dateRange)) state.dateRange = parsed.dateRange;
    if (LAUNCH_SITE_VALUES.has(parsed.launchSite)) state.launchSite = parsed.launchSite;
    if (ORBIT_VALUES.has(parsed.orbit)) state.orbit = parsed.orbit;
  } catch {
    // ignore bad local storage
  }
}

export function savePreferences() {
  const prefs = {
    dateMode: state.dateMode,
    missionType: state.missionType,
    sortMode: state.sortMode,
    keyword: state.keyword,
    activeOrg: state.activeOrg,
    flightType: state.flightType,
    dateRange: state.dateRange,
    launchSite: state.launchSite,
    orbit: state.orbit
  };

  localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
}

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    const parsed = raw ? JSON.parse(raw) : [];
    state.favorites = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.favorites = [];
  }
}

export function saveFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
}

export function isFavorite(id) {
  return state.favorites.some((launch) => launch.id === id);
}

// ---- Cache-first manifest cache (localStorage, schema-versioned) ---------
// Stores the last successful normalized live manifest so a repeat visit can
// render instantly while a background refresh runs. Pure helpers below are
// unit-tested without touching storage.

// Classify an age in ms into the freshness model (fresh | stale | expired).
// Negative ages (clock skew) are treated as fresh rather than discarded.
export function classifyCacheAge(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "fresh";
  if (ageMs < CACHE_FRESH_MS) return "fresh";
  if (ageMs < CACHE_STALE_MS) return "stale";
  return "expired";
}

// Human "N ago" wording for cache-age status messages.
export function cacheAgeLabel(ageMs) {
  const ms = Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Read + validate the cached manifest. Returns an info object:
//   { launches, truncated, savedAt, ageMs, freshness }
// or null when there is no cache, a schema mismatch, or malformed data (those
// are removed safely). Expired entries are returned with freshness "expired" so
// the loader can message + reload rather than silently presenting stale data.
export function getLaunchCache(now = Date.now()) {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEYS.manifest);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearLaunchCache();
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.schema !== MANIFEST_CACHE_SCHEMA ||
    !parsed.payload ||
    !Array.isArray(parsed.payload.launches)
  ) {
    clearLaunchCache();
    return null;
  }

  const savedAt = Number(parsed.savedAt || 0);
  const ageMs = Math.max(0, now - savedAt);
  return {
    launches: parsed.payload.launches,
    truncated: Boolean(parsed.payload.truncated),
    savedAt,
    ageMs,
    freshness: classifyCacheAge(ageMs)
  };
}

// A cache entry usable for immediate rendering (fresh or stale, never expired).
export function isUsableCache(info) {
  return Boolean(info) && (info.freshness === "fresh" || info.freshness === "stale");
}

// Persist a fresh normalized manifest. Guarded against quota / serialization
// failures so a full localStorage never breaks the app. Returns success.
export function saveLaunchCache(payload, now = Date.now()) {
  try {
    const wrapper = { schema: MANIFEST_CACHE_SCHEMA, savedAt: now, payload };
    localStorage.setItem(STORAGE_KEYS.manifest, JSON.stringify(wrapper));
    return true;
  } catch {
    return false;
  }
}

export function clearLaunchCache() {
  try {
    localStorage.removeItem(STORAGE_KEYS.manifest);
  } catch {
    // ignore
  }
}
