// Persistence layer: preferences and favorites in localStorage, and the live
// API response cache in sessionStorage. Every parse is guarded so corrupt
// storage never crashes the app. This module is intentionally render-free.

import { STORAGE_KEYS, CACHE_TTL_MS } from "./config.js";
import { state } from "./state.js";

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prefs);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    state.dateMode = parsed.dateMode || state.dateMode;
    state.missionType = parsed.missionType || state.missionType;
    state.sortMode = parsed.sortMode || state.sortMode;
    state.keyword = typeof parsed.keyword === "string" ? parsed.keyword : state.keyword;
  } catch {
    // ignore bad local storage
  }
}

export function savePreferences() {
  const prefs = {
    dateMode: state.dateMode,
    missionType: state.missionType,
    sortMode: state.sortMode,
    keyword: state.keyword
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

export function getLaunchCache() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const age = Date.now() - Number(parsed.savedAt || 0);
    if (age > CACHE_TTL_MS) return null;

    if (!Array.isArray(parsed.results)) return null;
    return parsed.results;
  } catch {
    return null;
  }
}

export function saveLaunchCache(results) {
  const payload = {
    savedAt: Date.now(),
    results
  };

  sessionStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(payload));
}
