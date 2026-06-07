// Keyword matching, sorting, and the combined filter pipeline that produces the
// list of launches currently shown in the results grid.

import { state } from "./state.js";
import { classifyMission } from "./utils.js";
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
    launch.statusName
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
      return (b.probability ?? -1) - (a.probability ?? -1);
    case "soonest":
    default:
      return new Date(a.net) - new Date(b.net);
  }
}

// Produces the FULL filtered + sorted list. The visible slice is applied at
// render time (state.visibleCount) so "Load more" / "Show all" can reveal more
// without re-running the pipeline.
export function applyFilters() {
  state.filteredLaunches = state.launches
    .filter((launch) => matchesKeyword(launch, state.keyword))
    .filter((launch) => (state.missionType === "all" ? true : classifyMission(launch) === state.missionType))
    .sort(compareLaunches);

  savePreferences();
}

// True when any non-default filter/search/sort is active (drives Reset enabled).
export function hasActiveFilters() {
  return (
    state.keyword.trim() !== "" ||
    state.missionType !== "all" ||
    state.sortMode !== "soonest"
  );
}
