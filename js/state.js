// Single shared, mutable application state object.
// Modules import this and read/write fields directly, mirroring the original
// single-file design while keeping the data in one well-known place.

import { DEFAULT_VISIBLE } from "./config.js";

export const state = {
  launches: [],
  filteredLaunches: [],
  favorites: [],
  nextLaunch: null,
  usingDemo: false,
  dataSource: "none",
  lastUpdated: null,
  // True when an LL2 feed reported more records than it returned (coverage note).
  truncated: false,
  // Time display mode: local | utc | site (launch-site timezone).
  dateMode: "local",
  // Active organization tab/tile filter (all | nasa | spacex | blue-origin |
  // rocket-lab | ula | firefly).
  activeOrg: "all",
  missionType: "all",
  // Flight-type filter (all | orbital | suborbital). "unknown" launches are
  // never matched by the explicit orbital/suborbital filters.
  flightType: "all",
  // Date-range filter (all | 24h | 7d | 30d | year).
  dateRange: "all",
  // Launch-site filter (all | cape-canaveral | kennedy | vandenberg | wallops |
  // rocketlab-lc1 | other).
  launchSite: "all",
  // Orbit filter (all | leo | sso | gto | geo | meo | polar | lunar |
  // interplanetary | suborbital | unknown).
  orbit: "all",
  sortMode: "soonest",
  keyword: "",
  // Progressive reveal: how many of the filtered launches are currently shown.
  visibleCount: DEFAULT_VISIBLE,
  // Mission currently open in the details modal (id), if any.
  selectedLaunchId: null,
  activeRequest: null,
  activeWeatherRequest: null,
  countdownTimer: null
};
