// Rolling store for the Previous launches panel.
//
// The panel keeps the most recent PREVIOUS_LIMIT completed launches in
// localStorage together with whatever recorded weather has already been
// fetched for them. It is a fixed-size window: when a provider flies again the
// new launch enters at the top and the oldest entry drops off the bottom,
// taking its stored weather with it. That keeps the saved payload bounded and
// means a launch's recorded conditions are fetched once, not once per visit.
//
// The merge is a pure function so it can be tested without a browser.

import { STORAGE_KEYS, PREVIOUS_LIMIT, PREVIOUS_TTL_MS } from "./config.js";

function netMs(launch) {
  const ms = new Date(launch?.net).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

// Merge a freshly fetched list into the stored one. Feed fields always win
// (an outcome can be revised after the fact); a recorded weather snapshot we
// already paid a request for is carried forward. Newest first, capped.
export function mergePreviousLaunches(stored, incoming, limit = PREVIOUS_LIMIT) {
  const byId = new Map();

  for (const launch of Array.isArray(stored) ? stored : []) {
    if (launch?.id) byId.set(launch.id, launch);
  }
  for (const launch of Array.isArray(incoming) ? incoming : []) {
    if (!launch?.id) continue;
    const existing = byId.get(launch.id);
    const next = { ...launch };
    if (existing?.weather) next.weather = existing.weather;
    byId.set(launch.id, next);
  }

  return Array.from(byId.values())
    .sort((a, b) => netMs(b) - netMs(a))
    .slice(0, Math.max(0, limit));
}

// Read the stored window. Returns { launches, savedAt, fresh } and never
// throws; malformed or unreadable storage simply reads as empty.
export function readPreviousStore(now = Date.now()) {
  const empty = { launches: [], savedAt: 0, fresh: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.previous);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.launches)) return empty;
    const savedAt = Number(parsed.savedAt) || 0;
    return {
      launches: parsed.launches.filter((l) => l && l.id),
      savedAt,
      fresh: now - savedAt <= PREVIOUS_TTL_MS
    };
  } catch {
    return empty;
  }
}

// Persist the window. Best effort: a quota or serialization failure just means
// the panel refetches next time.
export function writePreviousStore(launches, now = Date.now()) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.previous,
      JSON.stringify({ savedAt: now, launches: launches.slice(0, PREVIOUS_LIMIT) })
    );
  } catch {
    /* ignore */
  }
  return launches;
}

// Attach a recorded weather snapshot to one stored launch. Returns the updated
// window so callers can keep their in-memory copy in step.
export function setRecordedWeather(id, weather, now = Date.now()) {
  const { launches } = readPreviousStore(now);
  let changed = false;
  const next = launches.map((launch) => {
    if (launch.id !== id) return launch;
    changed = true;
    return { ...launch, weather };
  });
  if (changed) writePreviousStore(next, now);
  return next;
}
