// Live data layer: fetching upcoming launches from two Launch Library 2 feeds
// (SpaceX + Blue Origin providers, and NASA-tagged missions), normalizing the
// raw payload, and merging + de-duplicating the feeds by stable launch id with
// a conservative field-level merge. Request cancellation and a short
// sessionStorage cache keep us well inside LL2's 15-requests/hour budget.

import { API_PROVIDERS, API_NASA, NETWORK_TIMEOUT_MS } from "./config.js";
import { saveLaunchCache } from "./storage.js";
import { isPublicMissionUrl } from "./utils.js";

// Coerce a Launch Library latitude/longitude (often a numeric string) into a
// finite number, or null when missing/invalid.
function toCoord(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Pick the first candidate that validates as a genuine public mission page.
function firstPublicUrl(candidates) {
  for (const candidate of candidates) {
    const valid = isPublicMissionUrl(candidate);
    if (valid) return valid;
  }
  return "";
}

// LL2 2.3.0 exposes some fields as objects ({ id, name }) that were plain
// strings in older versions; read either shape safely.
function nameOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.name || "";
}

export function simplifyLaunch(raw) {
  const lsp = raw?.launch_service_provider || {};
  const mission = raw?.mission || {};
  const config = raw?.rocket?.configuration || {};
  const orbit = mission?.orbit || {};

  const agencies = Array.isArray(mission?.agencies)
    ? mission.agencies.map((a) => ({
        id: a?.id ?? null,
        name: a?.name || "",
        type: nameOf(a?.type),
        abbrev: a?.abbrev || ""
      }))
    : [];

  const families = Array.isArray(config?.families) ? config.families : [];
  const rocketFamily = nameOf(families[0]) || nameOf(config?.family) || "";

  const missionImage =
    raw?.image?.image_url || raw?.image_url || (typeof raw?.image === "string" ? raw.image : "") || "";
  const missionThumb = raw?.image?.thumbnail_url || "";
  const rocketImage = config?.image_url || "";
  const providerImage = lsp?.image_url || lsp?.logo_url || "";

  const missionName = mission?.name || "";
  const missionType = mission?.type || "";

  return {
    id: raw?.id || crypto.randomUUID?.() || `launch-${Math.random().toString(36).slice(2)}`,
    name: raw?.name || missionName || "Unknown mission",
    net: raw?.net || raw?.date_utc || "",
    lastUpdated: raw?.last_updated || "",
    missionName,
    missionType,
    program: nameOf(Array.isArray(raw?.program) ? raw.program[0] : raw?.program),
    details: mission?.description || raw?.details || "",
    statusName: nameOf(raw?.status) || (raw?.upcoming ? "Upcoming" : "Completed"),
    probability: typeof raw?.probability === "number" ? raw.probability : null,
    // Provider (launch service provider). `provider` kept for back-compat.
    provider: lsp?.name || "",
    providerName: lsp?.name || "",
    providerId: lsp?.id ?? null,
    providerType: nameOf(lsp?.type),
    // Mission agencies (NASA overlay, etc.).
    agencies,
    rocket: config?.full_name || config?.name || "",
    rocketFamily,
    orbitName: orbit?.name || "",
    orbitAbbrev: orbit?.abbrev || "",
    padName: raw?.pad?.name || "",
    location: raw?.pad?.location?.name || "",
    padLat: toCoord(raw?.pad?.latitude),
    padLon: toCoord(raw?.pad?.longitude),
    // IANA timezone for the launch site, used by the "Launch-site time" mode.
    tzId: raw?.pad?.location?.timezone_name || "",
    image: missionImage,
    missionImage,
    missionThumb,
    rocketImage,
    providerImage,
    imageCredit: raw?.image?.credit || "",
    webcast: raw?.vid_urls?.[0]?.url || raw?.video_url || raw?.links?.webcast || "",
    // Validated public-facing mission page only — never the LL2 API self URL.
    official: firstPublicUrl([
      raw?.info_urls?.[0]?.url,
      raw?.mission?.info_urls?.[0]?.url,
      raw?.info_url,
      raw?.links?.article
    ]),
    wikipedia: raw?.pad?.wiki_url || raw?.wiki_url || raw?.links?.wikipedia || "",
    upcoming: true
  };
}

// ---- Conservative field-level merge --------------------------------------
// `a` is the provider-feed record (authoritative on ties for determinism);
// `b` is the NASA-feed record. Non-empty values win; richer text/timestamps are
// preserved; agencies are unioned by id (or normalized name).

function nonEmpty(a, b) {
  const empty = a === null || a === undefined || a === "";
  return empty ? b : a;
}

function richerText(a, b) {
  const al = a ? String(a).length : 0;
  const bl = b ? String(b).length : 0;
  return bl > al ? b : a; // ties keep `a`
}

function moreRecent(a, b) {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(ta)) return b || a;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}

function unionAgencies(a = [], b = []) {
  const out = [];
  const seen = new Set();
  for (const ag of [...(a || []), ...(b || [])]) {
    if (!ag) continue;
    const key = ag.id !== null && ag.id !== undefined ? `id:${ag.id}` : `name:${String(ag.name || "").toLowerCase()}`;
    if (!key || key === "name:") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ag);
  }
  return out;
}

export function mergeLaunch(a, b) {
  return {
    ...b,
    ...a, // scalar fields default to the provider feed
    net: nonEmpty(a.net, b.net),
    name: nonEmpty(a.name, b.name),
    missionName: nonEmpty(a.missionName, b.missionName),
    missionType: nonEmpty(a.missionType, b.missionType),
    statusName: nonEmpty(a.statusName, b.statusName),
    probability: a.probability ?? b.probability,
    provider: nonEmpty(a.provider, b.provider),
    providerName: nonEmpty(a.providerName, b.providerName),
    providerId: a.providerId ?? b.providerId,
    providerType: nonEmpty(a.providerType, b.providerType),
    rocket: richerText(a.rocket, b.rocket),
    rocketFamily: nonEmpty(a.rocketFamily, b.rocketFamily),
    orbitName: nonEmpty(a.orbitName, b.orbitName),
    orbitAbbrev: nonEmpty(a.orbitAbbrev, b.orbitAbbrev),
    padName: nonEmpty(a.padName, b.padName),
    location: nonEmpty(a.location, b.location),
    padLat: a.padLat ?? b.padLat,
    padLon: a.padLon ?? b.padLon,
    tzId: nonEmpty(a.tzId, b.tzId),
    program: richerText(a.program, b.program),
    details: richerText(a.details, b.details),
    image: nonEmpty(a.image, b.image),
    missionImage: nonEmpty(a.missionImage, b.missionImage),
    missionThumb: nonEmpty(a.missionThumb, b.missionThumb),
    rocketImage: nonEmpty(a.rocketImage, b.rocketImage),
    providerImage: nonEmpty(a.providerImage, b.providerImage),
    webcast: nonEmpty(a.webcast, b.webcast),
    official: nonEmpty(a.official, b.official),
    wikipedia: nonEmpty(a.wikipedia, b.wikipedia),
    lastUpdated: moreRecent(a.lastUpdated, b.lastUpdated),
    agencies: unionAgencies(a.agencies, b.agencies)
  };
}

// Merge any number of already-normalized launch lists, de-duplicating by stable
// launch id. Earlier lists win ties (pass the provider feed first).
export function dedupeMerge(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const launch of list) {
      if (!launch || !launch.id) continue;
      const existing = map.get(launch.id);
      map.set(launch.id, existing ? mergeLaunch(existing, launch) : launch);
    }
  }
  return Array.from(map.values()).sort((x, y) => new Date(x.net) - new Date(y.net));
}

async function fetchFeed(url, signal) {
  const response = await fetch(url, { method: "GET", signal });
  if (!response.ok) throw new Error(`Launch API returned ${response.status}`);
  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  const count = Number.isFinite(Number(json?.count)) ? Number(json.count) : results.length;
  return { results, count };
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
      fetchFeed(API_PROVIDERS, controller.signal),
      fetchFeed(API_NASA, controller.signal)
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

    const failedFeeds = [];
    if (!providersOk) failedFeeds.push("providers");
    if (!nasaOk) failedFeeds.push("nasa");
    const partial = failedFeeds.length > 0;

    saveLaunchCache({ launches, truncated });
    return { launches, truncated, partial, failedFeeds };
  } finally {
    clearTimeout(timeout);
  }
}
