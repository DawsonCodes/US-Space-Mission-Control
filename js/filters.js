// Keyword matching, sorting, and the combined filter pipeline that produces the
// list of launches currently shown in the results grid.

import { state } from "./state.js";
import { classifyMissionType, matchesOrg, flightType } from "./organizations.js";
import { savePreferences } from "./storage.js";

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
    state.sortMode !== "soonest"
  );
}
