// Single shared, mutable application state object.
// Modules import this and read/write fields directly, mirroring the original
// single-file design while keeping the data in one well-known place.

import { DEFAULT_LIMIT } from "./config.js";

export const state = {
  launches: [],
  filteredLaunches: [],
  favorites: [],
  nextLaunch: null,
  usingDemo: false,
  dataSource: "none",
  dateMode: "local",
  missionType: "all",
  sortMode: "soonest",
  limit: DEFAULT_LIMIT,
  keyword: "",
  favoritesOnly: false,
  activeRequest: null,
  countdownTimer: null
};
