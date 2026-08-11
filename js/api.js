// Data layer.
//
// The dashboard prefers a snapshot that a scheduled workflow refreshes twice an
// hour and commits to the repository as a plain JSON file. Loading it is an
// ordinary static request to the same origin as the page, so a visitor makes no
// Launch Library call at all, cannot be rate limited, and gets the same complete
// list everybody else does.
//
// Calling LL2 directly is still here as a fallback, for when the snapshot is
// missing (a fresh fork, a local checkout) or has gone stale because the
// workflow stopped running. That path keeps its rate-limit handling, since it is
// the only one that can be refused.

import {
  API_PROVIDERS,
  API_NASA,
  API_PREVIOUS,
  SNAPSHOT_LAUNCHES,
  SNAPSHOT_PREVIOUS,
  SNAPSHOT_SCHEMA,
  SNAPSHOT_MAX_AGE_MS,
  FEED_MAX_PAGES,
  NETWORK_TIMEOUT_MS,
  RATE_LIMIT_COOLDOWN_MS,
  STORAGE_KEYS
} from "./config.js";
import { saveLaunchCache } from "./storage.js";
import {
  readPreviousStore,
  writePreviousStore,
  mergePreviousLaunches
} from "./previous-store.js";
import { simplifyLaunch, dedupeMerge } from "./normalize.js";

export { simplifyLaunch, mergeLaunch, dedupeMerge } from "./normalize.js";

// ---- Snapshot -------------------------------------------------------------
// A static JSON file on our own origin. `cache: "no-cache"` makes the browser
// revalidate rather than re-download: when the workflow has not committed
// anything new, the server answers 304 and no body crosses the wire. That is
// the "don't call unless something changed" behaviour, handled by HTTP itself.

function validateSnapshot(json) {
  if (!json || typeof json !== "object") return null;
  if (Number(json.schema) !== SNAPSHOT_SCHEMA) return null;
  if (!Array.isArray(json.launches)) return null;
  const generatedAt = Date.parse(json.generatedAt);
  if (!Number.isFinite(generatedAt)) return null;
  return {
    launches: json.launches.filter((l) => l && l.id),
    truncated: Boolean(json.truncated),
    generatedAt,
    counts: json.counts && typeof json.counts === "object" ? json.counts : {}
  };
}

export function snapshotAgeMs(snapshot, now = Date.now()) {
  if (!snapshot) return Infinity;
  return Math.max(0, now - snapshot.generatedAt);
}

export function isSnapshotUsable(snapshot, now = Date.now()) {
  return Boolean(snapshot) && snapshotAgeMs(snapshot, now) <= SNAPSHOT_MAX_AGE_MS;
}

export async function fetchSnapshot(url, { signal } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Network timeout", "AbortError"));
  }, NETWORK_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`Snapshot returned ${response.status}`);
    const snapshot = validateSnapshot(await response.json());
    if (!snapshot) throw new Error("Snapshot payload was not usable");
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Rate limiting --------------------------------------------------------
// LL2 answers 429 once the hourly allowance is gone. Retrying through that just
// burns the next hour too, so the refusal is remembered across reloads and the
// UI is told how long is left instead of being shown a generic failure.

export function rateLimitedUntil(now = Date.now()) {
  try {
    const until = Number(localStorage.getItem(STORAGE_KEYS.cooldown)) || 0;
    return until > now ? until : 0;
  } catch {
    return 0;
  }
}

function startCooldown(now = Date.now()) {
  const until = now + RATE_LIMIT_COOLDOWN_MS;
  try {
    localStorage.setItem(STORAGE_KEYS.cooldown, String(until));
  } catch {
    /* best effort */
  }
  return until;
}

export function clearRateLimit() {
  try {
    localStorage.removeItem(STORAGE_KEYS.cooldown);
  } catch {
    /* ignore */
  }
}

function rateLimitError(until) {
  const error = new Error("Launch API rate limit reached");
  error.name = "RateLimitError";
  error.rateLimited = true;
  error.until = until;
  return error;
}

async function fetchFeed(url, signal) {
  const response = await fetch(url, { method: "GET", signal });
  if (response.status === 429) throw rateLimitError(startCooldown());
  if (!response.ok) throw new Error(`Launch API returned ${response.status}`);
  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const count = Number.isFinite(Number(json?.count)) ? Number(json.count) : results.length;
  return { results, count };
}

// LL2 returns at most 100 records per request, so a feed that reports more
// matches than it returned is followed onto the next page. Bounded by
// FEED_MAX_PAGES so a large or misreported count can never spin the request
// budget; anything still missing after that is reported as truncated.
async function fetchFeedPaged(url, signal, maxPages = FEED_MAX_PAGES) {
  const first = await fetchFeed(url, signal);
  let results = first.results;

  for (let page = 1; page < maxPages; page += 1) {
    if (results.length === 0 || first.count <= results.length) break;
    try {
      const next = await fetchFeed(`${url}&offset=${results.length}`, signal);
      if (next.results.length === 0) break;
      results = results.concat(next.results);
    } catch (error) {
      // An extra page is a bonus, never a requirement. Keep the page we already
      // have and let `truncated` report the shortfall honestly.
      if (error?.name === "AbortError") throw error;
      break;
    }
  }

  return { results, count: first.count };
}

// Network fetch of BOTH feeds CONCURRENTLY (provider feed + NASA mission-agency
// feed), tolerant of a single feed failing. Normalizes, merges, and de-dupes by
// stable id, then writes the fresh manifest to the cache. Returns
// { launches, truncated, partial, failedFeeds }:
//   - partial is true when one feed failed but the other returned usable data
//     (the UI shows an honest partial-coverage warning instead of an error).
//   - throws only when BOTH feeds fail (or the request is aborted), so the
//     caller can fall back to cache/demo/error.
//
// Cache-first orchestration (read cache, render, background refresh) lives in
// main.js — this function always hits the network. A built-in timeout aborts a
// hung request; an optional external `signal` lets the caller cancel a refresh
// when a newer one supersedes it (so there are never duplicate in-flight loads).
export async function fetchLiveLaunches({ signal } = {}) {
  const until = rateLimitedUntil();
  if (until) throw rateLimitError(until);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Network timeout", "AbortError"));
  }, NETWORK_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    // allSettled so one provider feed failing temporarily can't destroy a load
    // that otherwise has usable data.
    const [providersR, nasaR] = await Promise.allSettled([
      fetchFeedPaged(API_PROVIDERS, controller.signal),
      fetchFeedPaged(API_NASA, controller.signal)
    ]);

    const providersOk = providersR.status === "fulfilled";
    const nasaOk = nasaR.status === "fulfilled";

    // Total failure (including abort/timeout): surface the error to the caller.
    if (!providersOk && !nasaOk) {
      throw providersR.reason || nasaR.reason || new Error("Both launch feeds failed");
    }

    const providers = providersOk ? providersR.value : { results: [], count: 0 };
    const nasa = nasaOk ? nasaR.value : { results: [], count: 0 };

    const launches = dedupeMerge(
      providers.results.map(simplifyLaunch),
      nasa.results.map(simplifyLaunch)
    );
    const truncated =
      providers.count > providers.results.length || nasa.count > nasa.results.length;

    // Upper bound on what the feeds say exists. The two feeds overlap (a NASA
    // mission on a SpaceX rocket is in both), so this is only used to say how
    // much was left behind when the list is truncated.
    const available = providers.count + nasa.count;

    const failedFeeds = [];
    if (!providersOk) failedFeeds.push("providers");
    if (!nasaOk) failedFeeds.push("nasa");
    const partial = failedFeeds.length > 0;

    // A partial result must never be cached. When the provider feed fails, what
    // survives is the NASA feed alone, which is every NASA mission and nothing
    // else. Saving that made the dashboard NASA-only on the next visit before a
    // single request was even sent, and it stayed that way until a full load
    // happened to succeed. The caller decides what to show; the cache keeps the
    // last complete manifest.
    if (!partial) saveLaunchCache({ launches, truncated });
    return { launches, truncated, available, partial, failedFeeds };
  } finally {
    clearTimeout(timeout);
  }
}


// ---- Upcoming launches: snapshot first, LL2 as a fallback -----------------
// Returns { launches, truncated, source, generatedAt, partial, failedFeeds }.
// `source` is "snapshot" normally, "snapshot-stale" when the workflow has
// clearly stopped and LL2 could not stand in, or "live" when LL2 answered.
export async function loadLaunches({ signal } = {}) {
  let stale = null;

  try {
    const snapshot = await fetchSnapshot(SNAPSHOT_LAUNCHES, { signal });
    if (isSnapshotUsable(snapshot)) {
      saveLaunchCache({ launches: snapshot.launches, truncated: snapshot.truncated });
      return {
        launches: snapshot.launches,
        truncated: snapshot.truncated,
        generatedAt: snapshot.generatedAt,
        counts: snapshot.counts,
        source: "snapshot",
        partial: false,
        failedFeeds: []
      };
    }
    stale = snapshot; // readable, but old enough to suggest the workflow stopped
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // No snapshot at all: a fork that has never run the workflow, or a local
    // checkout. Fall through to LL2.
  }

  try {
    const live = await fetchLiveLaunches({ signal });
    return { ...live, source: "live", generatedAt: Date.now() };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    if (stale) {
      saveLaunchCache({ launches: stale.launches, truncated: stale.truncated });
      return {
        launches: stale.launches,
        truncated: stale.truncated,
        generatedAt: stale.generatedAt,
        counts: stale.counts,
        source: "snapshot-stale",
        partial: false,
        failedFeeds: []
      };
    }
    throw error;
  }
}

// ---- Previous launches (lazy) --------------------------------------------
// Fetched only when the user opens the Previous launches panel, then kept in a
// fixed-size rolling store so reopening it costs no extra LL2 request and any
// recorded weather already fetched is reused instead of refetched.

export async function fetchPreviousLaunches({ signal, force = false } = {}) {
  const stored = readPreviousStore();
  if (!force && stored.fresh && stored.launches.length > 0) return stored.launches;

  // The workflow publishes completed launches too, so the normal path spends no
  // LL2 request here either. The rolling store still wraps it, because that is
  // what carries recorded weather forward and bounds what we keep.
  try {
    const snapshot = await fetchSnapshot(SNAPSHOT_PREVIOUS, { signal });
    if (isSnapshotUsable(snapshot)) {
      const merged = mergePreviousLaunches(stored.launches, snapshot.launches);
      writePreviousStore(merged);
      return merged;
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // Fall through to LL2.
  }

  // Cooling off: a stored window is far better than an error the user can do
  // nothing about, so show what we have and only complain when we have nothing.
  const until = rateLimitedUntil();
  if (until) {
    if (stored.launches.length > 0) return stored.launches;
    throw rateLimitError(until);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Network timeout", "AbortError"));
  }, NETWORK_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const { results } = await fetchFeed(API_PREVIOUS, controller.signal);
    const merged = mergePreviousLaunches(stored.launches, results.map(simplifyLaunch));
    writePreviousStore(merged);
    return merged;
  } catch (error) {
    // A failed refresh should not empty a window the user can still read.
    if (stored.launches.length > 0) return stored.launches;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
