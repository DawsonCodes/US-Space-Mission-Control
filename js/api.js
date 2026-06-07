// Live data layer: fetching upcoming launches (with request cancellation and
// caching) and normalizing the raw Launch Library 2 payload into the shape the
// rest of the app expects.

import { API_UPCOMING } from "./config.js";
import { state } from "./state.js";
import { getLaunchCache, saveLaunchCache } from "./storage.js";
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

export function simplifyLaunch(raw) {
  const imageUrl =
    raw?.image?.image_url ||
    raw?.image_url ||
    raw?.image ||
    raw?.mission_patches?.[0]?.image_url ||
    "";

  const missionName = raw?.mission?.name || "";
  const missionType = raw?.mission?.type || "";

  return {
    id: raw?.id || crypto.randomUUID?.() || `launch-${Math.random().toString(36).slice(2)}`,
    name: raw?.name || missionName || "Unknown mission",
    net: raw?.net || raw?.date_utc || "",
    missionName,
    missionType,
    details: raw?.mission?.description || raw?.details || "",
    statusName: raw?.status?.name || (raw?.upcoming ? "Upcoming" : "Completed"),
    probability: typeof raw?.probability === "number" ? raw.probability : null,
    provider: raw?.launch_service_provider?.name || "SpaceX",
    rocket: raw?.rocket?.configuration?.full_name || raw?.rocket?.configuration?.name || "",
    padName: raw?.pad?.name || "",
    location: raw?.pad?.location?.name || "",
    padLat: toCoord(raw?.pad?.latitude),
    padLon: toCoord(raw?.pad?.longitude),
    image: imageUrl,
    imageCredit: raw?.image?.credit || "",
    webcast:
      raw?.vid_urls?.[0]?.url ||
      raw?.video_url ||
      raw?.links?.webcast ||
      "",
    // Validated public-facing mission page only — never the LL2 API self URL.
    official: firstPublicUrl([
      raw?.info_urls?.[0]?.url,
      raw?.mission?.info_urls?.[0]?.url,
      raw?.info_url,
      raw?.links?.article
    ]),
    wikipedia:
      raw?.pad?.wiki_url ||
      raw?.wiki_url ||
      raw?.links?.wikipedia ||
      "",
    upcoming: true
  };
}

export async function fetchLiveLaunches(forceRefresh = false) {
  if (state.activeRequest) {
    state.activeRequest.abort();
  }

  if (!forceRefresh) {
    const cached = getLaunchCache();
    if (cached) {
      state.dataSource = "cache";
      return cached;
    }
  }

  const controller = new AbortController();
  state.activeRequest = controller;

  const response = await fetch(API_UPCOMING, {
    method: "GET",
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Launch API returned ${response.status}`);
  }

  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  saveLaunchCache(results);
  state.dataSource = "live";
  return results;
}
