// Composition root: imports every module, owns the controller actions (favorites,
// loading, filters, reveal, overlays, weather orchestration, organization tabs),
// wires DOM events, and boots the app.

import { DEFAULT_VISIBLE, LOAD_MORE_STEP } from "./config.js";
import { state } from "./state.js";
import { getDemoLaunches } from "./demo-data.js";
import {
  migrateLegacyStorage,
  loadPreferences,
  loadFavorites,
  saveFavorites,
  savePreferences,
  isFavorite
} from "./storage.js";
import { applyFilters } from "./filters.js";
import { fetchLiveLaunches } from "./api.js";
import { ORG } from "./organizations.js";
import { setupStarfield } from "./starfield.js";
import { openOverlay, closeOverlay } from "./modal.js";
import { getWeatherForLaunch } from "./weather.js";
import {
  els,
  setStatus,
  dismissStatus,
  updateInputsFromState,
  updateResetState,
  syncSearchClear,
  syncGridFavorite,
  setLoadingState,
  renderHero,
  renderResults,
  renderOverview,
  renderOrgControls,
  renderCoverageNote,
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

// The featured mission reflects the active organization + filters. Only refetch
// weather when the featured launch actually changes.
function updateHeroSpotlight() {
  const next = state.filteredLaunches[0] || null;
  const changed = (next?.id || null) !== (state.nextLaunch?.id || null);
  state.nextLaunch = next;
  renderHero();
  if (changed) {
    heroWeather = null;
    loadHeroWeather();
  } else {
    paintHeroWeather();
  }
}

// ----- Favorites ----------------------------------------------------------

function syncModalFavorite(id) {
  if (state.selectedLaunchId !== id) return;
  const btn = els.detailsContent.querySelector(`[data-favorite-id=${JSON.stringify(id)}]`);
  if (!btn) return;
  const fav = isFavorite(id);
  btn.classList.toggle("is-active", fav);
  btn.setAttribute("aria-pressed", String(fav));
  btn.textContent = fav ? "★ Saved" : "☆ Save";
}

function afterFavoriteChange(id) {
  saveFavorites();
  refreshHero();
  syncGridFavorite(id);
  renderOverview();
  renderOrgControls();
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
  const removed = state.favorites.find((launch) => launch.id === id);
  state.favorites = state.favorites.filter((launch) => launch.id !== id);
  if (state.favorites.length === before) return;
  afterFavoriteChange(id);
  setStatus(`Removed "${removed?.name || "mission"}" from saved.`, "removed");
}

function clearFavorites() {
  if (state.favorites.length === 0) {
    setStatus("No saved missions to clear.", "warning");
    return;
  }
  state.favorites = [];
  saveFavorites();
  refreshHero();
  renderResultsAndOverview();
  renderDrawer();
  renderSavedCount();
  setStatus("All saved missions cleared.", "removed");
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

function renderResultsAndOverview() {
  // Light import-free helper: render.js owns the functions; re-render grid + tiles.
  renderAll();
}

async function loadLaunches(forceRefresh = false) {
  setLoadingState();
  setStatus(
    forceRefresh ? "Refreshing live launch data…" : "Loading the U.S. spaceflight manifest…",
    "loading"
  );

  try {
    const { launches, truncated } = await fetchLiveLaunches(forceRefresh);
    state.launches = launches;
    state.truncated = truncated;
    state.usingDemo = false;
    state.lastUpdated = Date.now();
    state.visibleCount = DEFAULT_VISIBLE;
    applyFilters();
    state.nextLaunch = state.filteredLaunches[0] || null;
    renderAll();
    heroWeather = null;
    loadHeroWeather();
    const suffix = state.dataSource === "cache" ? "from cache." : "from the live API.";
    const note = truncated ? " (partial list)" : "";
    setStatus(`Loaded ${state.launches.length} upcoming launches ${suffix}${note}`, "success");
  } catch (error) {
    if (error.name === "AbortError") return;
    setStatus("Live API failed. Try again or switch to demo data.", "error");
    if (state.launches.length === 0) renderLoadError();
  } finally {
    state.activeRequest = null;
  }
}

function useDemoData() {
  state.launches = getDemoLaunches();
  state.truncated = false;
  state.usingDemo = true;
  state.dataSource = "demo";
  state.lastUpdated = Date.now();
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  state.nextLaunch = state.filteredLaunches[0] || null;
  renderAll();
  heroWeather = null;
  loadHeroWeather();
  setStatus(`Demo mode active with ${state.launches.length} missions.`, "warning");
}

// ----- Organization tabs / tiles ------------------------------------------

function setActiveOrg(org, { announce = false } = {}) {
  state.activeOrg = org;
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderOverview();
  renderOrgControls();
  renderResults();
  updateHeroSpotlight();
  updateResetState();
  savePreferences();
  if (announce) {
    const label = org === ORG.ALL ? "all tracked missions" : org.replace("-", " ");
    setStatus(`Showing ${label}.`, "info");
  }
}

function toggleOrg(org) {
  // Clicking the already-active organization returns to All tracked missions.
  setActiveOrg(state.activeOrg === org ? ORG.ALL : org);
}

// ----- Filters & reveal ---------------------------------------------------

function onFilterChange() {
  state.visibleCount = DEFAULT_VISIBLE; // reset reveal whenever the result set changes
  applyFilters();
  renderResults();
  renderOverview();
  renderOrgControls();
  updateHeroSpotlight();
  updateResetState(); // don't rewrite inputs (keeps the search caret in place)
}

function resetFilters() {
  state.keyword = "";
  state.activeOrg = "all";
  state.missionType = "all";
  state.flightType = "all";
  state.sortMode = "soonest";
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderResults();
  renderOverview();
  renderOrgControls();
  updateHeroSpotlight();
  updateInputsFromState();
  setStatus("Filters reset.", "success");
}

// Random honors EVERY active filter (org, mission type, flight type, search)
// by picking from the full filtered manifest — never the visible page. On a
// match it scrolls to and briefly highlights the card WITHOUT mutating the
// search field or collapsing the list.
function randomMission() {
  const pool = state.filteredLaunches;
  if (pool.length === 0) {
    if (state.launches.length === 0) {
      setStatus("Load some launches first so I have something to pick.", "warning");
    } else {
      setStatus("No matching missions available. Try changing or resetting your filters.", "warning");
    }
    return;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Make sure the pick is within the revealed range so it can be scrolled to.
  const index = pool.findIndex((l) => l.id === pick.id);
  if (index >= state.visibleCount) {
    state.visibleCount = index + 1;
    renderResults();
    renderOverview();
  }

  const card = document.querySelector(`[data-launch-id=${JSON.stringify(pick.id)}]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-flash");
    // Reflow so the animation can retrigger on repeated picks.
    void card.offsetWidth;
    card.classList.add("is-flash");
  }
  setStatus(`Random pick: "${pick.name}".`, "success");
}

function aboutDataSources() {
  setStatus(
    "U.S. Space Mission Control tracks NASA missions, SpaceX launches, and Blue Origin flights. " +
      "Launch data: Launch Library 2 (The Space Devs). Local weather: Open-Meteo. Not an official launch forecast.",
    "info"
  );
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

// Native-select arrow state. Focus alone must NOT rotate the arrow (the CSS
// :focus-within rotation was removed); only an explicitly-open popup does, via
// the .is-open class. Because browsers don't expose a reliable "popup closed"
// event, we reset on change/blur/Escape/Alt+ArrowUp and on any outside click.
const selectWraps = [];

function closeAllSelectArrows(except) {
  selectWraps.forEach((wrap) => {
    if (wrap !== except) wrap.classList.remove("is-open");
  });
}

function setupSelectArrows() {
  document.querySelectorAll(".select-wrap").forEach((wrap) => {
    const select = wrap.querySelector("select");
    if (!select) return;
    selectWraps.push(wrap);
    const close = () => wrap.classList.remove("is-open");

    select.addEventListener("pointerdown", () => {
      const willOpen = !wrap.classList.contains("is-open");
      closeAllSelectArrows(wrap);
      wrap.classList.toggle("is-open", willOpen);
    });
    select.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "Tab") close();
      else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) close();
      else if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) wrap.classList.add("is-open");
    });
    select.addEventListener("change", close); // a choice closes the popup
    select.addEventListener("blur", close);
  });

  // Any click outside an open select resets the arrow.
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".select-wrap")) closeAllSelectArrows(null);
  });
}

// Organization tabs: roving-tabindex keyboard navigation.
function setupOrgTabs() {
  if (!els.orgTabs) return;
  const tabs = Array.from(els.orgTabs.querySelectorAll("[data-org]"));

  els.orgTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-org]");
    if (!tab) return;
    setActiveOrg(tab.getAttribute("data-org"));
  });

  els.orgTabs.addEventListener("keydown", (event) => {
    const current = tabs.indexOf(event.target.closest("[data-org]"));
    if (current < 0) return;
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus();
    setActiveOrg(tabs[next].getAttribute("data-org"));
  });
}

function closeMoreMenu() {
  if (els.moreMenu) els.moreMenu.open = false;
}

function setupMoreMenu() {
  if (!els.moreMenu) return;
  // Close the disclosure after any outside click.
  document.addEventListener("pointerdown", (event) => {
    if (els.moreMenu.open && !els.moreMenu.contains(event.target)) closeMoreMenu();
  });
}

function attachEventListeners() {
  els.btnRefresh.addEventListener("click", () => loadLaunches(true));
  if (els.btnUseDemo)
    els.btnUseDemo.addEventListener("click", () => {
      closeMoreMenu();
      useDemoData();
    });
  if (els.btnReloadLive)
    els.btnReloadLive.addEventListener("click", () => {
      closeMoreMenu();
      loadLaunches(true);
    });
  if (els.btnResetMenu)
    els.btnResetMenu.addEventListener("click", () => {
      closeMoreMenu();
      resetFilters();
    });
  if (els.btnAbout)
    els.btnAbout.addEventListener("click", () => {
      closeMoreMenu();
      aboutDataSources();
    });

  els.btnClearFilters.addEventListener("click", resetFilters);
  els.btnRandom.addEventListener("click", randomMission);
  els.btnSaved.addEventListener("click", (e) => openSavedDrawer(e.currentTarget));
  els.btnClearFavorites.addEventListener("click", clearFavorites);
  els.btnLoadMore.addEventListener("click", () => {
    state.visibleCount += LOAD_MORE_STEP;
    renderResults();
    renderOverview();
  });
  els.btnShowAll.addEventListener("click", () => {
    state.visibleCount = state.filteredLaunches.length;
    renderResults();
    renderOverview();
  });

  els.keyword.addEventListener("input", (e) => {
    state.keyword = e.target.value;
    syncSearchClear();
    onFilterChange();
  });
  if (els.btnClearSearch) {
    els.btnClearSearch.addEventListener("click", () => {
      state.keyword = "";
      state.visibleCount = DEFAULT_VISIBLE;
      applyFilters();
      renderResults();
      renderOverview();
      updateHeroSpotlight();
      updateInputsFromState();
      els.keyword.focus();
    });
  }
  els.missionType.addEventListener("change", (e) => {
    state.missionType = e.target.value;
    onFilterChange();
  });
  if (els.flightType) {
    els.flightType.addEventListener("change", (e) => {
      state.flightType = e.target.value;
      onFilterChange();
    });
  }
  els.sortMode.addEventListener("change", (e) => {
    state.sortMode = e.target.value;
    onFilterChange();
  });
  els.dateMode.addEventListener("change", (e) => {
    state.dateMode = e.target.value;
    savePreferences();
    // Time-mode change must NOT reset pagination — only reformat dates.
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
    const statusClose = event.target.closest("[data-status-close]");
    if (statusClose) {
      dismissStatus();
      return;
    }

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

    // Overview tiles: organization shortcuts + Saved.
    const orgTile = event.target.closest(".overview-tile[data-org]");
    if (orgTile) {
      toggleOrg(orgTile.getAttribute("data-org"));
      return;
    }
    const savedTile = event.target.closest('.overview-tile[data-action="saved"]');
    if (savedTile) {
      openSavedDrawer(savedTile);
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
  migrateLegacyStorage();
  loadPreferences();
  loadFavorites();
  updateInputsFromState();
  applyFilters();
  state.nextLaunch = state.filteredLaunches[0] || null;
  renderAll();
  attachEventListeners();
  setupImageFallback();
  setupSelectArrows();
  setupOrgTabs();
  setupMoreMenu();
  startCountdownTicker();
  setupStarfield();
  loadLaunches(false);
}

init();
