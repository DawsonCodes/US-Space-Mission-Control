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
  dateMode: "local",
  missionType: "all",
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
