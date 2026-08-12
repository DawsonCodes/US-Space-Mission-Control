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
  DEBUG_TIMEOUT_MS,
  RATE_LIMIT_COOLDOWN_MS,
  STORAGE_KEYS,
  toDevEndpoint
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
    counts: json.counts && typeof json.counts === "object" ? json.counts : {},
    apiUsage: json.apiUsage && typeof json.apiUsage === "object" ? json.apiUsage : null
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

// Every Launch Library request this page makes, so the claim that a visitor
// spends none is something you can read off the About panel rather than take on
// faith. Snapshot reads are not counted: they are static files on our own
// origin and cost the API nothing.
const browserUsage = { requests: 0, byHost: {} };

export function apiUsageThisSession() {
  return { requests: browserUsage.requests, byHost: { ...browserUsage.byHost } };
}

function countBrowserRequest(url) {
  browserUsage.requests += 1;
  const host = String(url).includes("lldev.") ? "development mirror" : "launch API";
  browserUsage.byHost[host] = (browserUsage.byHost[host] || 0) + 1;
}

async function fetchFeed(url, signal) {
  countBrowserRequest(url);
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
    if (!partial) saveLaunchCache({ launches, truncated, generatedAt: Date.now() });
    return { launches, truncated, available, partial, failedFeeds };
  } finally {
    clearTimeout(timeout);
  }
}


// ---- Development mirror ---------------------------------------------------
// The Space Devs ask people to build against lldev rather than production, and
// it is not meaningfully rate limited. The catch is that it serves a cached
// dataset which can be days behind, so it is never the normal source: it backs
// the Debug data switch, and stands in when production has refused us and the
// alternative is showing nothing at all. Either way the UI labels it.

export async function fetchDevLaunches({ signal } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Network timeout", "AbortError"));
  }, DEBUG_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const [providersR, nasaR] = await Promise.allSettled([
      fetchFeedPaged(toDevEndpoint(API_PROVIDERS), controller.signal),
      fetchFeedPaged(toDevEndpoint(API_NASA), controller.signal)
    ]);

    const providersOk = providersR.status === "fulfilled";
    const nasaOk = nasaR.status === "fulfilled";
    if (!providersOk && !nasaOk) {
      throw providersR.reason || nasaR.reason || new Error("Both development feeds failed");
    }

    const providers = providersOk ? providersR.value : { results: [], count: 0 };
    const nasa = nasaOk ? nasaR.value : { results: [], count: 0 };

    const launches = dedupeMerge(
      providers.results.map(simplifyLaunch),
      nasa.results.map(simplifyLaunch)
    );
    if (launches.length === 0) throw new Error("Development mirror returned nothing");

    // Never cached: this data is knowingly out of date, and the cache is what
    // the real dashboard paints from on the next visit.
    return {
      launches,
      truncated:
        providers.count > providers.results.length || nasa.count > nasa.results.length,
      source: "dev",
      generatedAt: Date.now(),
      partial: !providersOk || !nasaOk,
      failedFeeds: [...(providersOk ? [] : ["providers"]), ...(nasaOk ? [] : ["nasa"])]
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDevPreviousLaunches({ signal } = {}) {
  const { results } = await fetchFeed(toDevEndpoint(API_PREVIOUS), signal);
  return results.map(simplifyLaunch);
}

// ---- Upcoming launches: snapshot first, LL2 as a fallback -----------------
// Returns { launches, truncated, source, generatedAt, partial, failedFeeds }.
// `source` is "snapshot" normally, "snapshot-stale" when the workflow has
// clearly stopped and LL2 could not stand in, or "live" when LL2 answered.
export async function loadLaunches({ signal, allowApi = true } = {}) {
  let stale = null;

  try {
    const snapshot = await fetchSnapshot(SNAPSHOT_LAUNCHES, { signal });
    if (isSnapshotUsable(snapshot)) {
      // generatedAt travels with the data so a reload's first paint already
      // shows the right countdown, before the snapshot has been re-read.
      saveLaunchCache({
        launches: snapshot.launches,
        truncated: snapshot.truncated,
        generatedAt: snapshot.generatedAt
      });
      return {
        launches: snapshot.launches,
        truncated: snapshot.truncated,
        generatedAt: snapshot.generatedAt,
        counts: snapshot.counts,
        apiUsage: snapshot.apiUsage,
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

  // The API is the fallback, and it is the only path with a budget. The caller
  // withholds permission when it already has something usable to show, so a
  // reload cannot spend a request just to redraw what is already on screen.
  if (!allowApi) {
    if (stale) {
      return {
        launches: stale.launches,
        truncated: stale.truncated,
        generatedAt: stale.generatedAt,
        counts: stale.counts,
        apiUsage: stale.apiUsage,
        source: "snapshot-stale",
        partial: false,
        failedFeeds: []
      };
    }
    const error = new Error("No published data, and the API was not permitted");
    error.name = "NoSnapshotError";
    error.noSnapshot = true;
    throw error;
  }

  try {
    const live = await fetchLiveLaunches({ signal });
    return { ...live, source: "live", generatedAt: Date.now() };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    if (stale) {
      saveLaunchCache({
        launches: stale.launches,
        truncated: stale.truncated,
        generatedAt: stale.generatedAt
      });
      return {
        launches: stale.launches,
        truncated: stale.truncated,
        generatedAt: stale.generatedAt,
        counts: stale.counts,
        apiUsage: stale.apiUsage,
        source: "snapshot-stale",
        partial: false,
        failedFeeds: []
      };
    }

    // The development mirror is NOT a fallback. It serves a cached dataset that
    // can be days behind and, when one of its feeds is short, produces exactly
    // the NASA-only list this app must never show. It is reached only when the
    // Debug data button is pressed, so nobody is served dated records without
    // asking for them.
    throw error;
  }
}

// ---- Previous launches (lazy) --------------------------------------------
// Fetched only when the user opens the Previous launches panel, then kept in a
// fixed-size rolling store so reopening it costs no extra LL2 request and any
// recorded weather already fetched is reused instead of refetched.

export async function fetchPreviousLaunches({ signal, force = false, allowApi = true } = {}) {
  const stored = readPreviousStore();

  // The published file is read first and unconditionally. It is a static
  // same-origin request, so a fresh local store is no reason to skip it, and
  // reading it is what keeps the panel current without anyone opening it.
  try {
    const snapshot = await fetchSnapshot(SNAPSHOT_PREVIOUS, { signal });
    if (snapshot.launches.length > 0) {
      // Deliberately NOT gated on snapshot age. The workflow leaves this file
      // byte-identical when nothing has changed, so its generatedAt is the last
      // time a tracked provider actually flew, which is routinely days old.
      // Treating that as stale sent the panel to the API on open, which is
      // precisely what publishing the file exists to avoid. Completed launches
      // do not go out of date; that is what makes them completed.
      const merged = mergePreviousLaunches(stored.launches, snapshot.launches);
      writePreviousStore(merged);
      return merged;
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    // Nothing published: fall through to the store, then to LL2.
  }

  if (!force && stored.fresh && stored.launches.length > 0) return stored.launches;

  // Same budget rule as the upcoming feed: the background sync that runs on the
  // 30-minute cycle reads the published file and stops there. Only opening the
  // panel is allowed to spend a request, and only when nothing is stored.
  if (!allowApi) {
    if (stored.launches.length > 0) return stored.launches;
    const error = new Error("No published previous launches, and the API was not permitted");
    error.name = "NoSnapshotError";
    error.noSnapshot = true;
    throw error;
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
    // A failed refresh should not empty a window the user can still read. The
    // development mirror is deliberately not consulted here either.
    if (stored.launches.length > 0) return stored.launches;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
