// Keyword matching, sorting, and the combined filter pipeline that produces the
// list of launches currently shown in the results grid.

import { state } from "./state.js";
import {
  classifyMissionType,
  matchesOrg,
  flightType,
  orbitCategory,
  launchSiteCategory
} from "./organizations.js";
import { savePreferences } from "./storage.js";

const HOUR_MS = 1000 * 60 * 60;
const DAY_MS = HOUR_MS * 24;

// Date-range filter against the launch NET. Missing/invalid dates only ever
// match "All upcoming" — a stricter range logically excludes an unknown date.
export function matchesDateRange(launch, range) {
  if (range === "all") return true;
  const t = new Date(launch?.net).getTime();
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  switch (range) {
    case "24h":
      return t >= now && t <= now + 24 * HOUR_MS;
    case "7d":
      return t >= now && t <= now + 7 * DAY_MS;
    case "30d":
      return t >= now && t <= now + 30 * DAY_MS;
    case "year":
      return new Date(t).getFullYear() === new Date(now).getFullYear();
    default:
      return true;
  }
}

export function matchesLaunchSite(launch, site) {
  if (site === "all") return true;
  return launchSiteCategory(launch) === site;
}

export function matchesOrbit(launch, orbit) {
  if (orbit === "all") return true;
  return orbitCategory(launch) === orbit;
}

export function matchesKeyword(launch, keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    launch.name,
    launch.missionName,
    launch.details,
    launch.location,
    launch.padName,
    launch.rocket,
    launch.statusName,
    launch.providerName,
    (launch.agencies || []).map((a) => a?.name).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function compareLaunches(a, b) {
  switch (state.sortMode) {
    case "latest":
      return new Date(b.net) - new Date(a.net);
    case "name":
      return a.name.localeCompare(b.name);
    case "probability":
      // Null-safe: missing probabilities sort last.
      return (b.probability ?? -1) - (a.probability ?? -1);
    case "updated": {
      // Null-safe: missing/invalid timestamps sort last.
      const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    }
    case "soonest":
    default:
      return new Date(a.net) - new Date(b.net);
  }
}

// All non-organization filters (search, mission type, flight type). Used both
// for the final result set and for the overview tile counts, which deliberately
// reflect the manifest BEFORE the active-organization filter so switching tabs
// never collapses the other tiles to zero.
function passesNonOrgFilters(launch) {
  if (!matchesKeyword(launch, state.keyword)) return false;
  if (state.missionType !== "all" && classifyMissionType(launch) !== state.missionType) return false;
  if (state.flightType !== "all" && flightType(launch) !== state.flightType) return false;
  if (!matchesDateRange(launch, state.dateRange)) return false;
  if (!matchesLaunchSite(launch, state.launchSite)) return false;
  if (!matchesOrbit(launch, state.orbit)) return false;
  return true;
}

// The matching manifest after non-org filters but before the active-org filter.
export function baseManifest() {
  return state.launches.filter(passesNonOrgFilters);
}

// Produces the FULL filtered + sorted list (org filter applied). The visible
// slice is applied at render time (state.visibleCount).
export function applyFilters() {
  state.filteredLaunches = state.launches
    .filter(passesNonOrgFilters)
    .filter((launch) => matchesOrg(launch, state.activeOrg))
    .sort(compareLaunches);

  savePreferences();
}

// True when any non-default filter/search/sort/organization is active.
export function hasActiveFilters() {
  return (
    state.keyword.trim() !== "" ||
    state.activeOrg !== "all" ||
    state.missionType !== "all" ||
    state.flightType !== "all" ||
    state.dateRange !== "all" ||
    state.launchSite !== "all" ||
    state.orbit !== "all" ||
    state.sortMode !== "soonest"
  );
}
