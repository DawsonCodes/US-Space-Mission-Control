// Composition root: imports every module, owns the controller actions that tie
// data + filters + rendering together (favorites, loading, reset, surprise),
// wires up the DOM events, and boots the app.

import { DEFAULT_LIMIT } from "./config.js";
import { state } from "./state.js";
import { getDemoLaunches } from "./demo-data.js";
import {
  loadPreferences,
  loadFavorites,
  saveFavorites,
  savePreferences,
  isFavorite
} from "./storage.js";
import { applyFilters } from "./filters.js";
import { fetchLiveLaunches, simplifyLaunch } from "./api.js";
import { setupStarfield } from "./starfield.js";
import {
  els,
  setStatus,
  updateInputsFromState,
  setLoadingState,
  renderHero,
  renderHeroStats,
  renderStats,
  renderResults,
  renderFavorites,
  updateCountdownNodes,
  refreshFooterMeta,
  renderAll
} from "./render.js";

// ----- Favorites actions -------------------------------------------------

function addFavorite(launch) {
  if (!launch || !launch.id || isFavorite(launch.id)) return;
  state.favorites.unshift(launch);
  saveFavorites();
  renderFavorites();
  renderStats();
  renderResults();
  renderHeroStats();
  renderHero();
  setStatus(`Saved "${launch.name}" to favorites.`, "success");
}

function removeFavorite(id) {
  const before = state.favorites.length;
  state.favorites = state.favorites.filter((launch) => launch.id !== id);
  if (state.favorites.length === before) return;
  saveFavorites();
  if (state.favoritesOnly) {
    applyFilters();
  }
  renderFavorites();
  renderStats();
  renderResults();
  renderHeroStats();
  renderHero();
  setStatus("Favorite removed.", "warning");
}

function clearFavorites() {
  if (state.favorites.length === 0) {
    setStatus("No favorites to clear.", "warning");
    return;
  }

  state.favorites = [];
  saveFavorites();
  applyFilters();
  renderFavorites();
  renderResults();
  renderStats();
  renderHeroStats();
  renderHero();
  setStatus("All favorites cleared.", "warning");
}

// ----- Data loading ------------------------------------------------------

async function loadLaunches(forceRefresh = false) {
  setLoadingState();
  setStatus(forceRefresh ? "Refreshing live launch data..." : "Loading latest SpaceX schedule...");

  try {
    const rawResults = await fetchLiveLaunches(forceRefresh);
    state.launches = rawResults.map(simplifyLaunch).sort((a, b) => new Date(a.net) - new Date(b.net));
    state.nextLaunch = state.launches[0] || null;
    state.usingDemo = false;
    applyFilters();
    renderAll();
    const suffix = state.dataSource === "cache" ? "from cache." : "from the live API.";
    setStatus(`Loaded ${state.launches.length} upcoming SpaceX launches ${suffix}`, "success");
  } catch (error) {
    if (error.name === "AbortError") return;
    setStatus("Live API failed. Demo data is ready if you still want the full UI working.", "danger");
    if (state.launches.length === 0) {
      useDemoData();
    }
  } finally {
    state.activeRequest = null;
  }
}

function useDemoData() {
  state.launches = getDemoLaunches();
  state.nextLaunch = state.launches[0] || null;
  state.usingDemo = true;
  state.dataSource = "demo";
  applyFilters();
  renderAll();
  setStatus(`Demo mode active with ${state.launches.length} missions.`, "warning");
}

// ----- Filter actions ----------------------------------------------------

function resetFilters() {
  state.keyword = "";
  state.missionType = "all";
  state.sortMode = "soonest";
  state.limit = DEFAULT_LIMIT;
  state.favoritesOnly = false;
  updateInputsFromState();
  applyFilters();
  renderResults();
  renderHeroStats();
  setStatus("Filters reset.", "success");
}

function surpriseMe() {
  if (state.launches.length === 0) {
    setStatus("Load some launches first so I have something to surprise you with.", "warning");
    return;
  }

  const pick = state.launches[Math.floor(Math.random() * state.launches.length)];
  state.keyword = pick.name.split("|").pop()?.trim() || pick.name;
  updateInputsFromState();
  applyFilters();
  renderResults();
  document.querySelector(`[data-launch-id="${pick.id}"]`)?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
  setStatus(`Locked onto "${pick.name}".`, "success");
}

// ----- Timers & event wiring ---------------------------------------------

function startCountdownTicker() {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
  }

  state.countdownTimer = window.setInterval(() => {
    updateCountdownNodes();
    refreshFooterMeta();
  }, 1000);
}

// Gracefully replace launch-card images that fail to load with the existing
// "No image available" placeholder. error events don't bubble, so we listen in
// the capture phase.
function setupImageFallback() {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const media = img.closest(".launch-card-media");
      if (!media) return;
      media.innerHTML =
        '<div class="empty-state" style="min-height:100%; border:none; border-radius:0;">No image available</div>';
    },
    true
  );
}

function attachEventListeners() {
  els.btnLoadLatest.addEventListener("click", () => loadLaunches(false));
  els.btnRefresh.addEventListener("click", () => loadLaunches(true));
  els.btnUseDemo.addEventListener("click", useDemoData);
  els.btnShowNext.addEventListener("click", () => {
    els.nextLaunchCard.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  els.btnClearFilters.addEventListener("click", resetFilters);
  els.btnSurprise.addEventListener("click", surpriseMe);
  els.btnRefreshFavorites.addEventListener("click", () => {
    renderFavorites();
    setStatus("Favorites refreshed.", "success");
  });
  els.btnClearFavorites.addEventListener("click", clearFavorites);

  els.btnFavoritesOnly.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    updateInputsFromState();
    applyFilters();
    renderResults();
    setStatus(state.favoritesOnly ? "Showing favorites only." : "Showing all matching launches.", "success");
  });

  els.keyword.addEventListener("input", (event) => {
    state.keyword = event.target.value;
    applyFilters();
    renderResults();
  });

  els.missionType.addEventListener("change", (event) => {
    state.missionType = event.target.value;
    applyFilters();
    renderResults();
  });

  els.sortMode.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    applyFilters();
    renderResults();
  });

  els.limit.addEventListener("change", (event) => {
    state.limit = Number(event.target.value) || DEFAULT_LIMIT;
    applyFilters();
    renderResults();
  });

  els.dateMode.addEventListener("change", (event) => {
    state.dateMode = event.target.value;
    savePreferences();
    renderAll();
    setStatus(`Showing ${state.dateMode === "utc" ? "UTC" : "local"} time.`, "success");
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-favorite-id]");
    if (!target) return;

    const launchId = target.getAttribute("data-favorite-id");
    const launch = state.launches.find((item) => item.id === launchId) || state.favorites.find((item) => item.id === launchId);

    if (!launch) return;

    if (isFavorite(launchId)) removeFavorite(launchId);
    else addFavorite(launch);
  });
}

// ----- Boot --------------------------------------------------------------

function init() {
  loadPreferences();
  loadFavorites();
  updateInputsFromState();
  applyFilters();
  renderAll();
  attachEventListeners();
  setupImageFallback();
  startCountdownTicker();
  setupStarfield();
  loadLaunches(false);
}

init();
