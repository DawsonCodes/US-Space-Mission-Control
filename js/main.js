// Composition root: imports every module, owns the controller actions (favorites,
// loading, filters, reveal, overlays, weather orchestration, organization tabs),
// wires DOM events, and boots the app.

import { DEFAULT_VISIBLE, LOAD_MORE_STEP, AUTO_REFRESH_MS } from "./config.js";
import { state } from "./state.js";
import { getDemoLaunches } from "./demo-data.js";
import {
  migrateLegacyStorage,
  loadPreferences,
  loadFavorites,
  saveFavorites,
  savePreferences,
  isFavorite,
  getLaunchCache,
  isUsableCache,
  clearLaunchCache,
  cacheAgeLabel
} from "./storage.js";
import { applyFilters } from "./filters.js";
import { loadLaunches as loadLaunchData, fetchPreviousLaunches } from "./api.js";
import { ORG, ORG_LABELS } from "./organizations.js";
import { applyOrgColors } from "./org-theme.js";
import { buildColorCustomizerContent, wireColorCustomizer } from "./customize.js";
import { setupSearchHint } from "./search-hint.js";
import { setupBoot, signalBootReady } from "./boot.js";
import { buildICS, icsFilename } from "./calendar.js";
import { buildMissionUrl, parseMissionId, stripMissionParam } from "./deeplink.js";
import { setupStarfield } from "./starfield.js";
import { openOverlay, closeOverlay, isOverlayOpen } from "./modal.js";
import { getWeatherForLaunch, getRecordedWeatherForLaunch } from "./weather.js";
import { setRecordedWeather } from "./previous-store.js";
import {
  els,
  setStatus,
  dismissStatus,
  setupStatusBanner,
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
  buildAboutContent,
  buildPreviousContent,
  buildPreviousDetail,
  buildWeatherHtml,
  favoriteButtonInner,
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
  btn.innerHTML = favoriteButtonInner(fav);
}

// Shared reduced-motion probe for the JS-driven animation hooks.
function prefersReducedMotionUI() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

// ANIM-16 — confetti burst from the star on every button bound to this mission.
// The button itself no longer jumps; the celebration is the particles.
const CONFETTI_BITS = 10;

function burstConfetti(id) {
  if (prefersReducedMotionUI()) return;
  try {
    document.querySelectorAll(`[data-favorite-id=${JSON.stringify(id)}]`).forEach((btn) => {
      const star = btn.querySelector?.(".fav-star");
      if (!star || typeof document.createElement !== "function") return;

      // The button clips its hover sheen, so open it up for the burst only.
      btn.classList?.add("is-bursting");

      for (let i = 0; i < CONFETTI_BITS; i += 1) {
        const bit = document.createElement("i");
        bit.className = "confetti-bit";
        // Even spread with a little jitter so it never looks mechanical.
        const angle = (i / CONFETTI_BITS) * Math.PI * 2 + Math.random() * 0.5;
        const distance = 16 + Math.random() * 14;
        bit.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
        bit.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
        bit.style.setProperty("--spin", `${Math.round(Math.random() * 240 - 120)}deg`);
        bit.style.setProperty("--delay", `${Math.round(Math.random() * 60)}ms`);
        bit.dataset.tone = String(i % 4); // gold / green / white / gold-dim
        star.appendChild(bit);
      }

      window.setTimeout(() => {
        btn.classList?.remove("is-bursting");
        star.querySelectorAll?.(".confetti-bit").forEach((b) => b.remove());
      }, 760);
    });
  } catch {
    /* decorative only — never break saving */
  }
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
  burstConfetti(launch.id); // ANIM-16
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
      <span>The launch data didn't load. It will retry automatically.</span>
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

// Cheap equality for an automatic refresh: same launches, same order, and no
// field that shows on screen has moved. Lets a scheduled tick that found
// nothing new leave the page completely alone, rather than re-rendering and
// flashing a status banner every half hour.
function isSameManifest(next, current) {
  if (!Array.isArray(next) || !Array.isArray(current)) return false;
  if (next.length !== current.length) return false;
  return next.every((launch, i) => {
    const other = current[i];
    return (
      other &&
      launch.id === other.id &&
      launch.net === other.net &&
      launch.statusName === other.statusName &&
      launch.name === other.name &&
      launch.probability === other.probability &&
      launch.webcast === other.webcast
    );
  });
}

// Apply a normalized manifest to state + the UI. `source` is live | cache |
// demo; `dataTime` is when the data was actually fetched (cache uses its saved
// time so "last refresh" stays honest). On a background replacement we preserve
// pagination so the user's revealed cards don't collapse (no layout jump).
function renderManifest(launches, truncated, source, dataTime, { preservePagination = false, entrance = "none" } = {}) {
  state.launches = Array.isArray(launches) ? launches : [];
  state.truncated = Boolean(truncated);
  state.usingDemo = source === "demo";
  state.dataSource = source;
  state.lastUpdated = dataTime || Date.now();
  if (!preservePagination) state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  state.visibleCount = Math.min(state.visibleCount, Math.max(DEFAULT_VISIBLE, state.filteredLaunches.length));
  const nextId = state.filteredLaunches[0]?.id || null;
  const heroChanged = nextId !== (state.nextLaunch?.id || null);
  state.nextLaunch = state.filteredLaunches[0] || null;
  renderAll({ resultsEntrance: entrance });
  signalBootReady(); // ANIM-01: first paint is up — the boot hand-off may proceed
  if (heroChanged) {
    heroWeather = null;
    loadHeroWeather();
  } else {
    paintHeroWeather();
  }
}

// Initial load. Cached data paints first so there is never an empty dashboard,
// then the snapshot is read. Reading it is a static request to our own origin,
// and the browser revalidates rather than re-downloading, so when the workflow
// has published nothing new the server answers 304 and no data crosses the wire.
function startInitialLoad() {
  const cache = getLaunchCache();
  if (isUsableCache(cache)) {
    renderManifest(cache.launches, cache.truncated, "cache", cache.savedAt, { entrance: "none" });
    setStatus(`Showing saved launch data from ${cacheAgeLabel(cache.ageMs)}. Checking for an update…`, "info");
    refreshData({ background: true });
  } else {
    if (cache && cache.freshness === "expired") {
      clearLaunchCache();
    }
    setLoadingState();
    refreshData({ background: false });
  }
}

// ----- Automatic refresh --------------------------------------------------
// The snapshot is republished twice an hour, so the page re-reads it on that
// cadence instead of asking the user to press Refresh. It also checks when a
// backgrounded tab comes back, which is the case that used to show hours-old
// data until someone noticed.

let autoRefreshTimer = null;
let windowTicker = null;
let lastRefreshAt = 0;

function markRefreshed() {
  lastRefreshAt = Date.now();
  setRefreshWindow();
}

// Whole minutes, rounded so the reading never sits on "0 minutes" while there
// is still time on the clock.
function minutesLabel(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

// The rolling window, in words. This replaced the Refresh button: there is
// nothing to press, so the UI's job is to show where the cycle stands.
function setRefreshWindow({ checking = false } = {}) {
  const el = els.refreshWindowText;
  if (!el) return;

  if (state.usingDemo) {
    els.refreshWindow?.setAttribute("data-state", "paused");
    el.textContent = "Debug data. Automatic updates paused.";
    return;
  }
  if (checking) {
    els.refreshWindow?.setAttribute("data-state", "checking");
    el.textContent = "Checking for new launch data…";
    return;
  }
  if (!lastRefreshAt) {
    els.refreshWindow?.setAttribute("data-state", "checking");
    el.textContent = "Loading launch data…";
    return;
  }

  const since = Date.now() - lastRefreshAt;
  const until = Math.max(0, AUTO_REFRESH_MS - since);
  els.refreshWindow?.setAttribute("data-state", "idle");
  el.textContent =
    since < 60000
      ? `Updated just now. Next check in ${minutesLabel(until)}.`
      : `Updated ${minutesLabel(since)} ago. Next check in ${minutesLabel(until)}.`;
}

// Updating is automatic on a rolling window: a timer while the tab is open, plus
// a check when a backgrounded tab comes back, which is the case that used to
// leave hours-old data on screen until someone pressed Refresh.
function setupAutoRefresh() {
  if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
  autoRefreshTimer = window.setInterval(() => {
    if (state.usingDemo) return;
    refreshData({ background: true, auto: true });
  }, AUTO_REFRESH_MS);

  // Keep the countdown honest between refreshes without re-rendering anything.
  if (windowTicker) window.clearInterval(windowTicker);
  windowTicker = window.setInterval(() => setRefreshWindow(), 30000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    setRefreshWindow();
    if (state.usingDemo) return;
    if (Date.now() - lastRefreshAt < AUTO_REFRESH_MS) return;
    refreshData({ background: true, auto: true });
  });

  setRefreshWindow();
}

// Short conservative delay before a single automatic retry when the very first
// (uncached) load fails transiently. Never retries endlessly.
const STARTUP_RETRY_DELAY_MS = 2500;

// Minutes until an LL2 cooldown expires, rounded up so "0 minutes" is never
// shown to someone who still has to wait.
function cooldownLabel(until) {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
}

function rateLimitMessage(error) {
  return `Launch Library is rate limiting this browser. It allows about 15 requests an hour. Try again in ${cooldownLabel(error.until || Date.now())}.`;
}

function partialCoverageMessage(failedFeeds, { kept = false } = {}) {
  const which = failedFeeds.includes("providers") ? "provider" : "NASA";
  if (kept) {
    return `The ${which} feed didn't respond, so the last complete list is still shown. The next check should fill it in.`;
  }
  return failedFeeds.includes("providers")
    ? "Partial list. The provider feed didn't respond, so only NASA missions came through. The next check should fill it in."
    : "Partial list. The NASA feed didn't respond, so some NASA overlaps may be missing.";
}

// How the loaded data should be described, given where it came from.
function sourceMessage({ source, launches, truncated, generatedAt }) {
  const note = truncated ? " Some launches beyond these are not listed." : "";
  if (source === "snapshot") {
    return {
      text: `${launches.length} upcoming launches, updated ${cacheAgeLabel(Date.now() - generatedAt)}.${note}`,
      tone: "success"
    };
  }
  if (source === "snapshot-stale") {
    return {
      text: `Showing the last published launch data from ${cacheAgeLabel(Date.now() - generatedAt)}. The scheduled update hasn't run recently.`,
      tone: "warning"
    };
  }
  return {
    text: `Loaded ${launches.length} upcoming launches directly from the launch API.${note}`,
    tone: "success"
  };
}

// Fetch fresh live data. `background` keeps current/cached content visible while
// refreshing; otherwise skeletons are already showing. A new refresh aborts any
// in-flight one (no duplicate loads); a superseded request resolves silently.
// `attempt` guards the one-time uncached-startup retry.
async function refreshData({ background = false, manual = false, auto = false, attempt = 0 } = {}) {
  if (state.activeRequest) state.activeRequest.abort();
  const controller = new AbortController();
  state.activeRequest = controller;

  if (manual) setStatus("Checking for new launch data…", "loading");
  else if (!background) setStatus(attempt > 0 ? "Retrying…" : "Loading launches…", "loading");
  setRefreshWindow({ checking: true });

  try {
    const result = await loadLaunchData({ signal: controller.signal });
    if (state.activeRequest !== controller) return; // superseded by a newer refresh
    markRefreshed();

    const { launches, truncated, partial, failedFeeds = [], source, generatedAt } = result;

    // A one-feed result is not a smaller version of the list, it is a different
    // list. When the provider feed fails, what comes back is every NASA mission
    // and nothing else, which reads as "the dashboard only has NASA now". If we
    // still hold something more complete, keep showing that and say why.
    if (partial) {
      const cache = getLaunchCache();
      const betterOnScreen = !failedFeeds.includes("nasa") && state.launches.length > launches.length;
      const betterCached = isUsableCache(cache) && cache.launches.length > launches.length;

      if (betterOnScreen) {
        setStatus(partialCoverageMessage(failedFeeds, { kept: true }), "warning");
        return;
      }
      if (betterCached) {
        renderManifest(cache.launches, cache.truncated, "cache", cache.savedAt, { entrance: "none" });
        setStatus(partialCoverageMessage(failedFeeds, { kept: true }), "warning");
        return;
      }
    }

    // An automatic tick that found nothing new should not disturb the page:
    // no re-render, no status banner, no scroll or pagination reset.
    const unchanged = auto && isSameManifest(launches, state.launches);
    if (unchanged) {
      markRefreshed();
      return;
    }

    const replacing = state.launches.length > 0 && state.dataSource !== "none";
    renderManifest(launches, truncated, source === "live" ? "live" : "snapshot", generatedAt, {
      preservePagination: replacing,
      entrance: replacing ? "fade" : "stagger"
    });

    if (partial) {
      // Usable data arrived, but one feed failed — honest, non-destructive.
      setStatus(partialCoverageMessage(failedFeeds), "warning");
    } else if (auto) {
      setStatus(`Updated. ${launches.length} upcoming launches.`, "success");
    } else {
      const { text, tone } = sourceMessage({ source, launches, truncated, generatedAt });
      setStatus(text, tone);
    }
    openMissionFromUrl();
  } catch (error) {
    // A request we deliberately aborted because a newer one started: ignore.
    if (error?.name === "AbortError" && controller.signal.aborted) return;

    const cache = getLaunchCache();
    if (isUsableCache(cache)) {
      // Stale-but-usable cache stays visible with an honest, non-destructive note.
      if (state.dataSource !== "cache" || state.launches.length === 0) {
        renderManifest(cache.launches, cache.truncated, "cache", cache.savedAt, { entrance: "none" });
      }
      setStatus(
        error?.rateLimited
          ? `Showing cached launch data from ${cacheAgeLabel(cache.ageMs)}. ${rateLimitMessage(error)}`
          : `Showing cached launch data from ${cacheAgeLabel(cache.ageMs)} because the live refresh failed.`,
        "warning"
      );
    } else if (error?.rateLimited) {
      // Retrying is guaranteed to fail and would extend the cooldown, so stop.
      setStatus(rateLimitMessage(error), "error");
      if (state.launches.length === 0) renderLoadError();
      signalBootReady();
    } else if (!background && !manual && attempt === 0) {
      // No usable cache on first load: retry exactly once after a short delay.
      setStatus("Launch data didn't load. Retrying shortly…", "loading");
      window.setTimeout(() => {
        if (!state.usingDemo && state.launches.length === 0) {
          refreshData({ background: false, attempt: 1 });
        }
      }, STARTUP_RETRY_DELAY_MS);
    } else {
      setStatus("Couldn't load launch data. It will try again automatically.", "error");
      if (state.launches.length === 0) renderLoadError();
      signalBootReady();
    }
  } finally {
    if (state.activeRequest === controller) {
      state.activeRequest = null;
      setRefreshWindow();
    }
  }
}

// Manual "Reload live data" / Refresh: force a network refresh, keeping the
// current content visible as a temporary fallback.
function loadLaunches(forceRefresh = false) {
  if (forceRefresh) refreshData({ background: true, manual: true });
  else startInitialLoad();
}

// Debug only. Lives in the footer rather than the More menu because it is not a
// feature: it swaps the real launch data for the bundled sample missions so the
// whole UI can be exercised offline. Toggling it off returns to real data.
function toggleDebugData() {
  if (state.usingDemo) {
    setStatus("Debug data off. Loading real launch data…", "loading");
    startInitialLoad();
    syncDebugToggle();
    return;
  }
  useDemoData();
  syncDebugToggle();
}

function syncDebugToggle() {
  const btn = els.btnUseDemo;
  if (!btn) return;
  btn.classList.toggle("is-active", state.usingDemo);
  btn.setAttribute("aria-pressed", String(state.usingDemo));
  btn.textContent = state.usingDemo ? "Debug data on" : "Debug data";
}

function useDemoData() {
  // Demo must never overwrite the live cache or be clobbered by a late live
  // response, so cancel any in-flight refresh first. renderManifest does not
  // write the cache for non-live sources.
  if (state.activeRequest) {
    state.activeRequest.abort();
    state.activeRequest = null;
  }
  renderManifest(getDemoLaunches(), false, "demo", Date.now(), { entrance: "stagger" });
  setRefreshWindow();
  setStatus(`Debug data active with ${state.launches.length} sample missions.`, "warning");
  openMissionFromUrl();
}

// ----- Organization tabs / tiles ------------------------------------------

// Scroll the active organization tab into view on narrow (scrollable) layouts.
function scrollActiveTabIntoView() {
  const active = els.orgTabs?.querySelector('[data-org][aria-selected="true"]');
  if (active && typeof active.scrollIntoView === "function") {
    active.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
}

function setActiveOrg(org, { announce = false } = {}) {
  state.activeOrg = org;
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderOverview();
  renderOrgControls();
  renderResults({ entrance: "fade" });
  updateHeroSpotlight();
  updateResetState();
  scrollActiveTabIntoView();
  savePreferences();
  if (announce) {
    const label = ORG_LABELS[org] || "all tracked missions";
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
  renderResults({ entrance: "fade" }); // quick container fade, no per-card replay
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
  state.dateRange = "all";
  state.launchSite = "all";
  state.orbit = "all";
  state.sortMode = "soonest";
  state.visibleCount = DEFAULT_VISIBLE;
  applyFilters();
  renderResults({ entrance: "fade" });
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
    renderResults({ append: true });
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

function openAbout(opener) {
  els.aboutContent.innerHTML = buildAboutContent();
  els.aboutModal.setAttribute("aria-labelledby", "aboutTitle");
  openOverlay(els.aboutModal, { returnFocusTo: opener || els.btnAbout });
}

function openLegend(opener) {
  els.legendModal.setAttribute("aria-labelledby", "legendTitle");
  openOverlay(els.legendModal, { returnFocusTo: opener || els.btnLegend });
}

// ----- Previous launches (lazy) -------------------------------------------
// The list is fetched the first time the panel is opened and then cached, so a
// normal visit never spends an LL2 request on it.
let previousRequest = null;
let previousWeatherRequest = null;
// The window currently on screen, so the detail view and its recorded weather
// can be resolved without another fetch.
let previousLaunches = [];

async function loadPreviousInto({ force = false } = {}) {
  if (!els.previousContent) return;
  els.previousContent.innerHTML = buildPreviousContent([], { state: "loading" });

  if (previousRequest) previousRequest.abort();
  const controller = new AbortController();
  previousRequest = controller;

  try {
    const launches = await fetchPreviousLaunches({ signal: controller.signal, force });
    if (previousRequest !== controller) return; // superseded
    previousLaunches = launches;
    els.previousContent.innerHTML = buildPreviousContent(launches);
  } catch (error) {
    if (error?.name === "AbortError" && controller.signal.aborted) return;
    els.previousContent.innerHTML = buildPreviousContent([], {
      state: "error",
      message: error?.rateLimited
        ? rateLimitMessage(error)
        : "Couldn't load previous launches. The launch API may be busy. Try again in a moment.",
      retry: !error?.rateLimited
    });
  } finally {
    if (previousRequest === controller) previousRequest = null;
  }
}

// Recorded conditions are fetched at most once per launch, then written into
// the rolling store alongside it. Reopening a launch, or coming back to it in a
// later visit, costs no request at all; when the launch ages out of the window
// its snapshot is discarded with it.
async function loadRecordedWeather(launch) {
  const mount = () => els.previousContent?.querySelector("[data-previous-weather]");
  if (launch.weather) return;

  if (previousWeatherRequest) previousWeatherRequest.abort();
  const controller = new AbortController();
  previousWeatherRequest = controller;

  try {
    const result = await getRecordedWeatherForLaunch(launch, { signal: controller.signal });
    if (previousWeatherRequest !== controller) return; // superseded
    const node = mount();
    if (node) node.innerHTML = buildWeatherHtml(result, { recorded: true });

    // Only a real reading is worth keeping; a transient failure should retry.
    if (result.status !== "error") {
      launch.weather = result;
      previousLaunches = setRecordedWeather(launch.id, result);
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    const node = mount();
    if (node) node.innerHTML = buildWeatherHtml({ status: "error" }, { recorded: true });
  } finally {
    if (previousWeatherRequest === controller) previousWeatherRequest = null;
  }
}

function showPreviousDetail(id) {
  if (!els.previousContent) return;
  const launch = previousLaunches.find((l) => l.id === id);
  els.previousContent.innerHTML = buildPreviousDetail(launch, { weather: launch?.weather });
  els.previousContent.scrollTop = 0;
  if (launch) loadRecordedWeather(launch);
}

function showPreviousList() {
  if (!els.previousContent) return;
  if (previousWeatherRequest) {
    previousWeatherRequest.abort();
    previousWeatherRequest = null;
  }
  els.previousContent.innerHTML = buildPreviousContent(previousLaunches);
  els.previousContent.scrollTop = 0;
}

function openPrevious(opener) {
  if (!els.previousModal || !els.previousContent) return;
  els.previousModal.setAttribute("aria-labelledby", "previousTitle");
  openOverlay(els.previousModal, {
    returnFocusTo: opener || els.btnPrevious,
    onClose: () => {
      if (previousRequest) {
        previousRequest.abort();
        previousRequest = null;
      }
      if (previousWeatherRequest) {
        previousWeatherRequest.abort();
        previousWeatherRequest = null;
      }
    }
  });
  loadPreviousInto();
}

let colorCustomizerWired = false;
function openColorCustomizer(opener) {
  if (!els.orgColorsModal || !els.orgColorsContent) return;
  els.orgColorsContent.innerHTML = buildColorCustomizerContent();
  if (!colorCustomizerWired) {
    // Live preview happens automatically (changing the :root tokens restyles
    // every badge/pill/tile); no dashboard re-render is required.
    wireColorCustomizer(els.orgColorsContent);
    colorCustomizerWired = true;
  }
  els.orgColorsModal.setAttribute("aria-labelledby", "orgColorsTitle");
  openOverlay(els.orgColorsModal, { returnFocusTo: opener || els.btnCustomizeColors });
}

// ----- Calendar export & share links --------------------------------------

function downloadCalendar(id) {
  const launch = findLaunch(id);
  if (!launch) return;
  const ics = buildICS(launch);
  if (!ics) {
    setStatus("This launch has no confirmed time yet, so it can't be added to a calendar.", "warning");
    return;
  }
  try {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename(launch);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after the click has a chance to start the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Calendar event downloaded for "${launch.name}".`, "success");
  } catch {
    setStatus("Couldn't generate the calendar file in this browser.", "error");
  }
}

async function copyMissionLink(id) {
  const launch = findLaunch(id);
  if (!launch) return;
  const url = buildMissionUrl(window.location.href, id);
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) {
    // Graceful fallback: a temporary textarea + execCommand for older browsers.
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand && document.execCommand("copy");
      ta.remove();
    } catch {
      copied = false;
    }
  }
  if (copied) setStatus("Mission link copied.", "success");
  else setStatus(`Copy not supported — link: ${url}`, "info");
}

// ----- Mission deep links (?mission=<id>) ---------------------------------

// Open the mission referenced by the current URL, if any, once data is loaded.
function openMissionFromUrl() {
  const id = parseMissionId(window.location.search);
  if (!id) return;
  const launch = findLaunch(id);
  if (launch) {
    openDetails(id, null, { fromUrl: true });
  } else {
    setStatus("That shared mission isn't in the current view. Try reloading live data.", "warning");
    // Leave the page usable; drop the stale param.
    history.replaceState({}, "", stripMissionParam(window.location.href));
  }
}

function onPopState() {
  const id = parseMissionId(window.location.search);
  if (id) {
    if (state.selectedLaunchId !== id) {
      const launch = findLaunch(id);
      if (launch) openDetails(id, null, { fromUrl: true });
    }
  } else if (isOverlayOpen(els.detailsModal)) {
    closeOverlay();
  }
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

function openDetails(id, opener, { fromUrl = false } = {}) {
  const launch = findLaunch(id);
  if (!launch) return;
  state.selectedLaunchId = id;
  els.detailsContent.innerHTML = buildDetailsContent(launch);
  els.detailsModal.setAttribute("aria-labelledby", "detailsTitle");

  // Reflect the open mission in the URL (?mission=<id>) without reloading, so
  // the link is shareable and the Back button closes the modal. When opened
  // FROM the URL (deep link or popstate) we don't push a new entry.
  if (!fromUrl) {
    try {
      history.pushState({ mission: id }, "", buildMissionUrl(window.location.href, id));
    } catch {
      // history may be unavailable (e.g. file://) — degrade silently.
    }
  }

  const fromDrawer = opener ? els.savedDrawer.contains(opener) : false;
  openOverlay(els.detailsModal, {
    returnFocusTo: fromDrawer ? els.btnSaved : opener,
    onClose: () => {
      state.selectedLaunchId = null;
      if (state.activeWeatherRequest) {
        state.activeWeatherRequest.abort();
        state.activeWeatherRequest = null;
      }
      // Remove the mission query param on close (no reload).
      if (parseMissionId(window.location.search)) {
        try {
          history.replaceState({}, "", stripMissionParam(window.location.href));
        } catch {
          /* ignore */
        }
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
        fallback.textContent = "No mission image available";
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
  // Escape closes the menu and restores focus to the More button.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !els.moreMenu.open) return;
    closeMoreMenu();
    els.moreMenu.querySelector("summary")?.focus();
  });
}

// Mission insights disclosure: accessible button with aria-expanded, defaulting
// to collapsed on small screens so mobile stays compact.
function setupInsights() {
  if (!els.insightsToggle || !els.insightsBody) return;

  let revealTimer = null;
  const setOpen = (open, { animate = false } = {}) => {
    els.insightsToggle.setAttribute("aria-expanded", String(open));
    els.insightsBody.hidden = !open;
    // ANIM-13: only cascade the chips when the section is actually opened —
    // NOT on every re-render (renderOverview rebuilds this markup on each
    // keystroke, which previously replayed the stagger constantly).
    if (revealTimer) window.clearTimeout(revealTimer);
    els.insightsBody.classList?.remove("is-revealing");
    if (open && animate) {
      void els.insightsBody.offsetWidth;
      els.insightsBody.classList?.add("is-revealing");
      revealTimer = window.setTimeout(() => els.insightsBody.classList?.remove("is-revealing"), 600);
    }
  };

  const mobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  setOpen(!mobile);

  els.insightsToggle.addEventListener("click", () => {
    setOpen(els.insightsToggle.getAttribute("aria-expanded") !== "true", { animate: true });
  });
}

function attachEventListeners() {
  if (els.btnUseDemo) els.btnUseDemo.addEventListener("click", () => toggleDebugData());
  if (els.btnResetMenu)
    els.btnResetMenu.addEventListener("click", () => {
      closeMoreMenu();
      resetFilters();
    });
  if (els.btnAbout)
    els.btnAbout.addEventListener("click", (e) => {
      closeMoreMenu();
      openAbout(e.currentTarget);
    });
  if (els.btnLegend)
    els.btnLegend.addEventListener("click", (e) => {
      closeMoreMenu();
      openLegend(e.currentTarget);
    });
  if (els.btnPrevious)
    els.btnPrevious.addEventListener("click", (e) => {
      closeMoreMenu();
      openPrevious(e.currentTarget);
    });
  if (els.btnCustomizeColors)
    els.btnCustomizeColors.addEventListener("click", (e) => openColorCustomizer(e.currentTarget));

  els.btnClearFilters.addEventListener("click", resetFilters);
  els.btnRandom.addEventListener("click", randomMission);
  els.btnSaved.addEventListener("click", (e) => openSavedDrawer(e.currentTarget));
  els.btnClearFavorites.addEventListener("click", clearFavorites);
  els.btnLoadMore.addEventListener("click", () => {
    // Increment by 10, clamped to the filtered total. Append only the new cards
    // so existing cards (and scroll position) stay stable; only new ones animate.
    state.visibleCount = Math.min(state.visibleCount + LOAD_MORE_STEP, state.filteredLaunches.length);
    renderResults({ append: true });
    renderOverview();
  });
  els.btnShowAll.addEventListener("click", () => {
    state.visibleCount = state.filteredLaunches.length;
    renderResults({ append: true });
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
      renderResults({ entrance: "fade" });
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
  if (els.dateRange) {
    els.dateRange.addEventListener("change", (e) => {
      state.dateRange = e.target.value;
      onFilterChange();
    });
  }
  if (els.launchSite) {
    els.launchSite.addEventListener("change", (e) => {
      state.launchSite = e.target.value;
      onFilterChange();
    });
  }
  if (els.orbit) {
    els.orbit.addEventListener("change", (e) => {
      state.orbit = e.target.value;
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
    const modeLabel = state.dateMode === "utc" ? "UTC" : state.dateMode === "site" ? "launch-site" : "local";
    setStatus(`Showing ${modeLabel} time.`, "success");
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

    const previousRetry = event.target.closest("[data-previous-retry]");
    if (previousRetry) {
      loadPreviousInto({ force: true });
      return;
    }

    const previousDetails = event.target.closest("[data-previous-id]");
    if (previousDetails) {
      showPreviousDetail(previousDetails.getAttribute("data-previous-id"));
      return;
    }

    if (event.target.closest("[data-previous-back]")) {
      showPreviousList();
      return;
    }

    // "Clear all" affordance inside the active-filter summary.
    const clearFiltersBtn = event.target.closest("[data-clear-filters]");
    if (clearFiltersBtn) {
      resetFilters();
      return;
    }

    // Overview tiles: Showing returns to All, org tiles toggle, Saved opens
    // the drawer.
    const showingTile = event.target.closest('.overview-tile[data-action="showing"]');
    if (showingTile) {
      setActiveOrg(ORG.ALL);
      return;
    }
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

    const calendarBtn = event.target.closest("[data-calendar-id]");
    if (calendarBtn) {
      downloadCalendar(calendarBtn.getAttribute("data-calendar-id"));
      return;
    }

    const shareBtn = event.target.closest("[data-share-id]");
    if (shareBtn) {
      copyMissionLink(shareBtn.getAttribute("data-share-id"));
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
      if (isFavorite(id)) {
        // ANIM-17: if the click came from the saved drawer, let the card collapse
        // before the list re-renders; elsewhere remove immediately.
        const savedCard = favBtn.closest?.(".saved-card");
        if (savedCard && !prefersReducedMotionUI()) {
          savedCard.classList.add("is-removing");
          window.setTimeout(() => removeFavorite(id), 200);
        } else {
          removeFavorite(id);
        }
      } else {
        addFavorite(launch);
      }
    }
  });
}

// ----- Boot --------------------------------------------------------------

function init() {
  // ANIM-01: startup title shimmer -> hand-off -> section reveal. Guarded so a
  // boot failure can never leave the dashboard hidden behind the overlay.
  try {
    setupBoot();
  } catch {
    document.documentElement?.classList?.remove("is-booting");
    document.getElementById("bootScreen")?.remove?.();
  }
  migrateLegacyStorage();
  applyOrgColors(); // apply saved/default organization accents before first paint
  loadPreferences();
  loadFavorites();
  updateInputsFromState();
  applyFilters();
  state.nextLaunch = state.filteredLaunches[0] || null;
  renderAll();
  attachEventListeners();
  setupStatusBanner();
  setupImageFallback();
  setupSelectArrows();
  setupOrgTabs();
  setupMoreMenu();
  setupInsights();
  setupSearchHint(els.keyword);
  window.addEventListener("popstate", onPopState);
  startCountdownTicker();
  setupStarfield();
  loadLaunches(false);
  setupAutoRefresh();
  syncDebugToggle();
}

init();
