// Composition root: imports every module, owns the controller actions (favorites,
// loading, filters, reveal, overlays, weather orchestration), wires DOM events,
// and boots the app.

import { DEFAULT_VISIBLE, LOAD_MORE_STEP } from "./config.js";
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
import { openOverlay, closeOverlay } from "./modal.js";
import { getWeatherForLaunch } from "./weather.js";
import {
  els,
  setStatus,
  updateInputsFromState,
  updateResetState,
  syncGridFavorite,
  setLoadingState,
  renderHero,
  renderHeroMeta,
  renderStats,
  renderResults,
  renderDrawer,
  renderSavedCount,
  buildDetailsContent,
  renderWeatherInto,
  updateCountdownNodes,
  refreshFooterMeta,
  renderAll
} from "./render.js";

// Last weather result for the hero, so re-rendering the hero (e.g. after a
// favorite toggle) can repaint weather without a flicker or refetch.
let heroWeather = null;

// ----- Hero weather -------------------------------------------------------

function heroWeatherMount() {
  return els.nextLaunchCard.querySelector("[data-weather]");
}

function paintHeroWeather() {
  renderWeatherInto(heroWeatherMount(), heroWeather, { compact: true });
}

function refreshHero() {
  renderHero();
  paintHeroWeather();
}

async function loadHeroWeather() {
  if (!state.nextLaunch) return;
  heroWeather = { status: "loading" };
  paintHeroWeather();
  try {
    heroWeather = await getWeatherForLaunch(state.nextLaunch);
  } catch {
    heroWeather = { status: "error" };
  }
  paintHeroWeather();
}

// ----- Favorites ----------------------------------------------------------

function syncModalFavorite(id) {
  if (state.selectedLaunchId !== id) return;
  const btn = els.detailsContent.querySelector(`[data-favorite-id=${JSON.stringify(id)}]`);
  if (!btn) return;
  const fav = isFavorite(id);
  btn.classList.toggle("is-active", fav);
  btn.textContent = fav ? "Remove from saved" : "Save mission";
}

function afterFavoriteChange(id) {
  saveFavorites();
  refreshHero();
  syncGridFavorite(id);
  renderStats();
  renderDrawer();
  renderSavedCount();
  syncModalFavorite(id);
}

function addFavorite(launch) {
  if (!launch || !launch.id || isFavorite(launch.id)) return;
  state.favorites.unshift(launch);
  afterFavoriteChange(launch.id);
  setStatus(`Saved "${launch.name}" to your missions.`, "success");
}

function removeFavorite(id) {
  const before = state.favorites.length;
  state.favorites = state.favorites.filter((launch) => launch.id !== id);
  if (state.favorites.length === before) return;
  afterFavoriteChange(id);
  setStatus("Mission removed from saved.", "warning");
}

function clearFavorites() {
  if (state.favorites.length === 0) {
    setStatus("No saved missions to clear.", "warning");
    return;
  }
  state.favorites = [];
  saveFavorites();
  refreshHero();
  renderResults();
  renderStats();
  renderDrawer();
  renderSavedCount();
  setStatus("All saved missions cleared.", "warning");
}

// ----- Data loading -------------------------------------------------------

function renderLoadError() {
  els.results.innerHTML = `
    <div class="empty-state">
      <strong>Couldn't load live launches</strong>
      <span>The launch API didn't respond. Try again, or switch to demo data.</span>
      <button class="btn btn-primary" data-retry type="button">Retry</button>
    </div>
  `;
  els.resultsMeta.textContent = "Live data unavailable.";
  els.btnLoadMore.hidden = true;
  els.btnShowAll.hidden = true;
}

async function loadLaunches(forceRefresh = false) {
  setLoadingState();
  setStatus(forceRefresh ? "Refreshing live launch data..." : "Loading latest SpaceX schedule...");

  try {
    const rawResults = await fetchLiveLaunches(forceRefresh);
    state.launches = rawResults.map(simplifyLaunch).sort((a, b) => new Date(a.net) - new Date(b.net));
    state.nextLaunch = state.launches[0] || null;
    state.usingDemo = false;
    state.lastUpdated = Date.now();
    state.visibleCount = DEFAULT_VISIBLE;
    applyFilters();
    renderAll();
    loadHeroWeather();
    const suffix = state.dataSource === "cache" ? "from cache." : "from the live API.";
    setStatus(`Loaded ${state.launches.length} upcoming SpaceX launches ${suffix}`, "success");
  } catch (error) {
    if (error.name === "AbortError") return;
    setStatus("Live API failed. Try again or switch to demo data.", "danger");
    if (state.launches.length === 0) renderLoadError();
  } finally {
    state.activeRequest = null;
  }
}

function useDemoData() {
  state.launches = getDemoLaunches();
  state.nextLaunch = state.launches[0] || null;
  state.usingDemo = true;
  state.dataSource = "demo";
  state.lastUpdated = Date.now();
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderAll();
  loadHeroWeather();
  setStatus(`Demo mode active with ${state.launches.length} missions.`, "warning");
}

// ----- Filters & reveal ---------------------------------------------------

function onFilterChange() {
  state.visibleCount = DEFAULT_VISIBLE; // reset reveal whenever the result set changes
  applyFilters();
  renderResults();
  updateResetState(); // don't rewrite inputs (keeps the search caret in place)
}

function resetFilters() {
  state.keyword = "";
  state.missionType = "all";
  state.sortMode = "soonest";
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderResults();
  updateInputsFromState();
  setStatus("Filters reset.", "success");
}

function randomMission() {
  if (state.launches.length === 0) {
    setStatus("Load some launches first so I have something to pick.", "warning");
    return;
  }
  const pick = state.launches[Math.floor(Math.random() * state.launches.length)];
  state.keyword = pick.name.split("|").pop()?.trim() || pick.name;
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderResults();
  updateInputsFromState();
  document.querySelector(`[data-launch-id=${JSON.stringify(pick.id)}]`)?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
  setStatus(`Locked onto "${pick.name}".`, "success");
}

// ----- Overlays -----------------------------------------------------------

function openSavedDrawer(opener) {
  renderDrawer();
  openOverlay(els.savedDrawer, { returnFocusTo: opener || els.btnSaved });
}

function findLaunch(id) {
  return (
    state.launches.find((l) => l.id === id) ||
    state.favorites.find((l) => l.id === id) ||
    null
  );
}

async function loadDetailsWeather(launch) {
  const mount = els.detailsContent.querySelector("[data-weather]");
  renderWeatherInto(mount, { status: "loading" });

  if (state.activeWeatherRequest) state.activeWeatherRequest.abort();
  const controller = new AbortController();
  state.activeWeatherRequest = controller;

  try {
    const result = await getWeatherForLaunch(launch, { signal: controller.signal });
    if (state.selectedLaunchId !== launch.id) return; // selection changed
    renderWeatherInto(els.detailsContent.querySelector("[data-weather]"), result);
  } catch (error) {
    if (error.name === "AbortError") return;
    renderWeatherInto(els.detailsContent.querySelector("[data-weather]"), { status: "error" });
  } finally {
    if (state.activeWeatherRequest === controller) state.activeWeatherRequest = null;
  }
}

function openDetails(id, opener) {
  const launch = findLaunch(id);
  if (!launch) return;
  state.selectedLaunchId = id;
  els.detailsContent.innerHTML = buildDetailsContent(launch);
  els.detailsModal.setAttribute("aria-labelledby", "detailsTitle");

  const fromDrawer = els.savedDrawer.contains(opener);
  openOverlay(els.detailsModal, {
    returnFocusTo: fromDrawer ? els.btnSaved : opener,
    onClose: () => {
      state.selectedLaunchId = null;
      if (state.activeWeatherRequest) {
        state.activeWeatherRequest.abort();
        state.activeWeatherRequest = null;
      }
    }
  });

  loadDetailsWeather(launch);
}

// ----- Timers & wiring ----------------------------------------------------

function startCountdownTicker() {
  if (state.countdownTimer) window.clearInterval(state.countdownTimer);
  state.countdownTimer = window.setInterval(() => {
    updateCountdownNodes();
    refreshFooterMeta();
  }, 1000);
}

function setupImageFallback() {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const media = img.closest(".launch-card-media");
      if (!media) return;
      media.querySelector("img")?.remove();
      if (!media.querySelector(".media-fallback")) {
        const fallback = document.createElement("div");
        fallback.className = "media-fallback";
        fallback.textContent = "No image available";
        media.prepend(fallback);
      }
    },
    true
  );
}

function attachEventListeners() {
  els.btnRefresh.addEventListener("click", () => loadLaunches(true));
  els.btnUseDemo.addEventListener("click", useDemoData);
  els.btnClearFilters.addEventListener("click", resetFilters);
  els.btnRandom.addEventListener("click", randomMission);
  els.btnSaved.addEventListener("click", (e) => openSavedDrawer(e.currentTarget));
  els.btnClearFavorites.addEventListener("click", clearFavorites);
  els.btnLoadMore.addEventListener("click", () => {
    state.visibleCount += LOAD_MORE_STEP;
    renderResults();
  });
  els.btnShowAll.addEventListener("click", () => {
    state.visibleCount = state.filteredLaunches.length;
    renderResults();
  });

  els.keyword.addEventListener("input", (e) => {
    state.keyword = e.target.value;
    onFilterChange();
  });
  els.missionType.addEventListener("change", (e) => {
    state.missionType = e.target.value;
    onFilterChange();
  });
  els.sortMode.addEventListener("change", (e) => {
    state.sortMode = e.target.value;
    onFilterChange();
  });
  els.dateMode.addEventListener("change", (e) => {
    state.dateMode = e.target.value;
    savePreferences();
    renderAll();
    paintHeroWeather();
    if (state.selectedLaunchId) {
      const launch = findLaunch(state.selectedLaunchId);
      if (launch) {
        els.detailsContent.innerHTML = buildDetailsContent(launch);
        loadDetailsWeather(launch);
      }
    }
    setStatus(`Showing ${state.dateMode === "utc" ? "UTC" : "local"} time.`, "success");
  });

  // Delegated clicks for dynamically rendered controls.
  document.addEventListener("click", (event) => {
    const overlayClose = event.target.closest("[data-overlay-close]");
    if (overlayClose) {
      closeOverlay();
      return;
    }

    const retry = event.target.closest("[data-retry]");
    if (retry) {
      loadLaunches(true);
      return;
    }

    const detailsBtn = event.target.closest("[data-details-id]");
    if (detailsBtn) {
      openDetails(detailsBtn.getAttribute("data-details-id"), detailsBtn);
      return;
    }

    const favBtn = event.target.closest("[data-favorite-id]");
    if (favBtn) {
      const id = favBtn.getAttribute("data-favorite-id");
      const launch = findLaunch(id);
      if (!launch) return;
      if (isFavorite(id)) removeFavorite(id);
      else addFavorite(launch);
    }
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
