// Persistence layer: preferences and favorites in localStorage, and the live
// API response cache in sessionStorage. Every parse is guarded so corrupt
// storage never crashes the app. This module is intentionally render-free.

import { STORAGE_KEYS, LEGACY_STORAGE_KEYS, CACHE_TTL_MS } from "./config.js";
import { state } from "./state.js";

const ORG_VALUES = new Set(["all", "nasa", "spacex", "blue-origin"]);
const FLIGHT_VALUES = new Set(["all", "orbital", "suborbital"]);

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

    state.dateMode = parsed.dateMode === "utc" ? "utc" : state.dateMode;
    state.missionType = typeof parsed.missionType === "string" ? parsed.missionType : state.missionType;
    state.sortMode = typeof parsed.sortMode === "string" ? parsed.sortMode : state.sortMode;
    state.keyword = typeof parsed.keyword === "string" ? parsed.keyword : state.keyword;
    if (ORG_VALUES.has(parsed.activeOrg)) state.activeOrg = parsed.activeOrg;
    if (FLIGHT_VALUES.has(parsed.flightType)) state.flightType = parsed.flightType;
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
    flightType: state.flightType
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

// The launch cache stores a normalized, merged payload: { launches, truncated }.
export function getLaunchCache() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const age = Date.now() - Number(parsed.savedAt || 0);
    if (age > CACHE_TTL_MS) return null;

    const payload = parsed.payload;
    if (!payload || !Array.isArray(payload.launches)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function saveLaunchCache(payload) {
  const wrapper = {
    savedAt: Date.now(),
    payload
  };

  sessionStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(wrapper));
}
