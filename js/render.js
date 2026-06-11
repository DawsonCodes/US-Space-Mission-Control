// Rendering layer: owns the cached DOM references and every function that writes
// markup to the page (hero spotlight, mission-overview tiles, schedule cards,
// results counts, saved drawer, details modal, weather snippets, countdowns,
// status banner). It builds overlay *content* but never drives overlay
// mechanics (that lives in modal.js).

import { state } from "./state.js";
import {
  escapeHtml,
  safeUrl,
  formatDate,
  formatCompactDate,
  getRelativeLabel,
  getCountdownText,
  validTimeZone
} from "./utils.js";
import { isFavorite } from "./storage.js";
import { hasActiveFilters, baseManifest } from "./filters.js";
import { WEATHER_FORECAST_DAYS } from "./config.js";
import {
  ORG,
  ORG_LABELS,
  ORG_BADGE_CLASS,
  PROVIDER_ORGS,
  ORG_MATCHERS,
  orgTags,
  isNASA,
  classifyMissionType,
  missionTypeBadgeClass,
  MISSION_TYPE_LABELS,
  flightType,
  FLIGHT_TYPE_LABELS,
  ORBIT_LABELS,
  LAUNCH_SITE_LABELS,
  normalizeStatus,
  statusBadgeClass
} from "./organizations.js";
import { resolveLaunchImage, launchImageAlt } from "./images.js";
import { weatherCodeLabel, formatTemperature } from "./weather.js";
import { createStatusTimer, STATUS_DURATION_MS } from "./status-timer.js";

export const els = {
  status: document.getElementById("status"),
  keyword: document.getElementById("keyword"),
  missionType: document.getElementById("missionType"),
  flightType: document.getElementById("flightType"),
  dateRange: document.getElementById("dateRange"),
  launchSite: document.getElementById("launchSite"),
  orbit: document.getElementById("orbit"),
  sortMode: document.getElementById("sortMode"),
  dateMode: document.getElementById("dateMode"),
  results: document.getElementById("results"),
  resultsMeta: document.getElementById("resultsMeta"),
  coverageNote: document.getElementById("coverageNote"),
  activeFilters: document.getElementById("activeFilters"),
  overviewTiles: document.getElementById("overviewTiles"),
  insightsToggle: document.getElementById("insightsToggle"),
  insightsBody: document.getElementById("insightsBody"),
  insightsChips: document.getElementById("insightsChips"),
  orgTabs: document.getElementById("orgTabs"),
  btnCustomizeColors: document.getElementById("btnCustomizeColors"),
  orgColorsModal: document.getElementById("orgColorsModal"),
  orgColorsContent: document.getElementById("orgColorsContent"),
  moreMenu: document.getElementById("moreMenu"),
  nextLaunchCard: document.getElementById("nextLaunchCard"),
  dataSource: document.getElementById("dataSource"),
  lastUpdated: document.getElementById("lastUpdated"),
  footerMeta: document.getElementById("footerMeta"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnUseDemo: document.getElementById("btnUseDemo"),
  btnReloadLive: document.getElementById("btnReloadLive"),
  btnResetMenu: document.getElementById("btnResetMenu"),
  btnAbout: document.getElementById("btnAbout"),
  btnLegend: document.getElementById("btnLegend"),
  aboutModal: document.getElementById("aboutModal"),
  aboutContent: document.getElementById("aboutContent"),
  legendModal: document.getElementById("legendModal"),
  btnClearFilters: document.getElementById("btnClearFilters"),
  btnRandom: document.getElementById("btnRandom"),
  btnSaved: document.getElementById("btnSaved"),
  savedCount: document.getElementById("savedCount"),
  btnLoadMore: document.getElementById("btnLoadMore"),
  btnShowAll: document.getElementById("btnShowAll"),
  savedDrawer: document.getElementById("savedDrawer"),
  drawerList: document.getElementById("drawerList"),
  drawerCount: document.getElementById("drawerCount"),
  btnClearFavorites: document.getElementById("btnClearFavorites"),
  detailsModal: document.getElementById("detailsModal"),
  detailsContent: document.getElementById("detailsContent"),
  btnClearSearch: document.getElementById("btnClearSearch")
};

// ----- Status banner lifecycle -------------------------------------------
// Temporary, dismissible status messages. Ordinary tones (success/info/warning/
// removed) auto-dismiss after EXACTLY 10s. A single pure timer (status-timer.js)
// is the one source of truth: both the visible seconds and the progress-bar
// width are derived from the SAME remaining value every tick, so they can never
// desync, and the wall-clock deadline means a hidden/backgrounded tab can't
// corrupt the timing. Hovering or keyboard-focusing the banner pauses it and
// preserves the exact remaining time; leaving resumes. "loading" and "error"
// persist (no countdown) until replaced or dismissed.

const STATUS_TICK_MS = 200;
const PERSISTENT_TONES = new Set(["loading", "error"]);
const statusTimer = createStatusTimer(STATUS_DURATION_MS);
let statusInterval = null;

function clearStatusInterval() {
  if (statusInterval) {
    window.clearInterval(statusInterval);
    statusInterval = null;
  }
}

function statusHasCountdown(tone) {
  return !PERSISTENT_TONES.has(tone);
}

function paintStatusCountdown() {
  const el = els.status;
  if (!el) return;
  const count = el.querySelector("[data-status-count]");
  if (count) count.textContent = `${statusTimer.seconds()}s`;
  const bar = el.querySelector("[data-status-progress]");
  if (bar) bar.style.width = `${statusTimer.progress() * 100}%`;
}

function runStatusCountdown() {
  clearStatusInterval();
  statusTimer.start();
  paintStatusCountdown();
  statusInterval = window.setInterval(() => {
    paintStatusCountdown();
    if (statusTimer.isExpired()) dismissStatus();
  }, STATUS_TICK_MS);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function dismissStatus() {
  clearStatusInterval();
  statusTimer.stop();
  const el = els.status;
  if (!el || el.hidden) return;

  const collapse = () => {
    el.hidden = true;
    el.classList.remove("is-leaving");
    el.innerHTML = "";
    delete el.dataset.tone;
  };

  if (prefersReducedMotion()) {
    collapse();
    return;
  }
  el.classList.add("is-leaving");
  window.setTimeout(collapse, 200);
}

export function setStatus(message, tone = "info") {
  const el = els.status;
  if (!el) return;
  clearStatusInterval();
  statusTimer.stop();
  el.classList.remove("is-leaving");
  el.hidden = false;
  el.dataset.tone = tone;

  const withCountdown = statusHasCountdown(tone);
  // The countdown + progress line are decorative; hide them from assistive tech
  // so screen readers announce the message once, not every tick.
  const countdown = withCountdown
    ? `<span class="status-count" data-status-count aria-hidden="true">${Math.round(STATUS_DURATION_MS / 1000)}s</span>`
    : "";
  const progress = withCountdown
    ? `<span class="status-progress" data-status-progress aria-hidden="true"></span>`
    : "";

  el.innerHTML =
    `<span class="status-text">${escapeHtml(message)}</span>` +
    countdown +
    `<button type="button" class="status-close" data-status-close aria-label="Dismiss message">&times;</button>` +
    progress;

  if (withCountdown) runStatusCountdown();
}

// Pause the auto-dismiss countdown while the banner is hovered or keyboard-
// focused; resume (preserving remaining time) when the pointer/focus leaves.
// Wired once at boot.
export function setupStatusBanner() {
  const el = els.status;
  if (!el) return;
  const pause = () => {
    if (statusTimer.isActive()) statusTimer.pause();
  };
  const resume = () => {
    if (statusTimer.isActive() && statusTimer.isPaused()) {
      statusTimer.resume();
      paintStatusCountdown();
    }
  };
  el.addEventListener("mouseenter", pause);
  el.addEventListener("mouseleave", resume);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", resume);
}

// Format a launch date explicitly in local or UTC, independent of the global
// time-mode toggle (the details modal shows both).
function detailDate(dateString, utc = false) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const options = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  };
  if (utc) options.timeZone = "UTC";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

// Format a launch date in its launch-site timezone for the details modal, or
// null when the launch has no usable timezone (the modal then omits the row).
function siteDate(launch) {
  const date = new Date(launch?.net);
  if (Number.isNaN(date.getTime())) return null;
  const tz = validTimeZone(launch?.tzId);
  if (!tz) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: tz
  }).format(date);
}

function concise(launch) {
  return launch.location || launch.padName || "Location pending";
}

// ----- Badge builders -----------------------------------------------------

function orgBadgesHtml(launch) {
  return orgTags(launch)
    .map(
      (tag) =>
        `<span class="badge org-badge ${ORG_BADGE_CLASS[tag]}">${escapeHtml(ORG_LABELS[tag])}</span>`
    )
    .join("");
}

function missionTypeBadgeHtml(launch) {
  const type = classifyMissionType(launch);
  return `<span class="badge ${missionTypeBadgeClass(type)}">${escapeHtml(MISSION_TYPE_LABELS[type])}</span>`;
}

// Flight-type badge — omitted entirely when the type is unknown (no claim).
function flightTypeBadgeHtml(launch) {
  const ft = flightType(launch);
  if (ft === "unknown") return "";
  return `<span class="badge flight-${ft}">${escapeHtml(FLIGHT_TYPE_LABELS[ft])}</span>`;
}

function statusBadgeHtml(launch) {
  const { label } = normalizeStatus(launch);
  return `<span class="badge ${statusBadgeClass(launch)}">${escapeHtml(label)}</span>`;
}

// ----- Webcast availability (honest) ---------------------------------------
// We never claim a stream is LIVE — LL2 gives us a URL, not a live state.
// Inside a near-launch window (30 min before NET through ~3 h after) the action
// reads "Check live webcast" and gets a restrained pulse (disabled for
// reduced-motion users via the global rule); otherwise it reads
// "Webcast available". No webcast URL → no action at all.

const WEBCAST_WINDOW_BEFORE_MS = 30 * 60 * 1000;
const WEBCAST_WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;

export function webcastState(launch) {
  const url = safeUrl(launch?.webcast);
  if (!url) return null;
  const net = new Date(launch?.net).getTime();
  if (Number.isFinite(net)) {
    const now = Date.now();
    if (now >= net - WEBCAST_WINDOW_BEFORE_MS && now <= net + WEBCAST_WINDOW_AFTER_MS) {
      return { url, label: "Check live webcast", nearLaunch: true };
    }
  }
  return { url, label: "Webcast available", nearLaunch: false };
}

function webcastActionHtml(launch) {
  const w = webcastState(launch);
  if (!w) return "";
  const cls = w.nearLaunch ? "card-link webcast-link is-near-launch" : "card-link webcast-link";
  return `<a class="${cls}" href="${w.url}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${w.label} for ${launch.name}`)}">${escapeHtml(w.label)}</a>`;
}

function favoriteButtonHtml(launch, { variant = "grid" } = {}) {
  const active = isFavorite(launch.id);
  const cls = variant === "hero" ? "favorite-btn" : "favorite-btn btn-small";
  const label = active ? "★ Saved" : "☆ Save";
  const aria = active ? `Remove ${launch.name} from saved` : `Save ${launch.name}`;
  return `<button class="${cls} ${active ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button" aria-pressed="${active}" aria-label="${escapeHtml(aria)}">${label}</button>`;
}

// ----- Reset / inputs -----------------------------------------------------

export function updateResetState() {
  if (els.btnClearFilters) els.btnClearFilters.disabled = !hasActiveFilters();
}

export function updateInputsFromState() {
  if (els.keyword) els.keyword.value = state.keyword;
  if (els.missionType) els.missionType.value = state.missionType;
  if (els.flightType) els.flightType.value = state.flightType;
  if (els.dateRange) els.dateRange.value = state.dateRange;
  if (els.launchSite) els.launchSite.value = state.launchSite;
  if (els.orbit) els.orbit.value = state.orbit;
  if (els.sortMode) els.sortMode.value = state.sortMode;
  if (els.dateMode) els.dateMode.value = state.dateMode;
  updateResetState();
  syncSearchClear();
  renderSavedCount();
  renderOrgControls();
}

export function syncSearchClear() {
  if (els.btnClearSearch) els.btnClearSearch.hidden = state.keyword === "";
}

export function syncGridFavorite(id) {
  const fav = isFavorite(id);
  els.results
    .querySelectorAll(`[data-favorite-id=${JSON.stringify(id)}]`)
    .forEach((btn) => {
      btn.classList.toggle("is-active", fav);
      btn.setAttribute("aria-pressed", String(fav));
      btn.textContent = fav ? "★ Saved" : "☆ Save";
    });
}

export function renderSavedCount() {
  const n = state.favorites.length;
  if (els.savedCount) els.savedCount.textContent = String(n);
  if (els.btnSaved) els.btnSaved.setAttribute("aria-label", `Saved missions (${n})`);
  if (els.drawerCount) els.drawerCount.textContent = String(n);
}

// Polished full-page loading state used only when no usable cached manifest is
// available: hero spotlight skeleton, overview tile skeletons, an insights
// placeholder, and ten launch-card skeletons. Shimmer is CSS-driven and removed
// for reduced-motion users. Real content replaces all of it cleanly.
export function setLoadingState() {
  if (els.nextLaunchCard) {
    els.nextLaunchCard.innerHTML = `
      <div class="placeholder-card spotlight-skeleton" aria-hidden="true">
        <div class="placeholder-line placeholder-line-lg"></div>
        <div class="placeholder-pills">
          <span class="placeholder-pill"></span>
          <span class="placeholder-pill"></span>
        </div>
        <div class="placeholder-line"></div>
        <div class="placeholder-line"></div>
        <div class="placeholder-block"></div>
      </div>`;
  }

  if (els.overviewTiles) {
    els.overviewTiles.innerHTML = Array.from({ length: 8 })
      .map(() => `<div class="overview-tile is-skeleton" aria-hidden="true"><span class="skeleton-num"></span><span class="skeleton-label"></span></div>`)
      .join("");
  }
  if (els.insightsChips) {
    els.insightsChips.innerHTML = Array.from({ length: 6 })
      .map(() => `<div class="insight-chip is-skeleton" aria-hidden="true"></div>`)
      .join("");
  }

  els.results.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 10; i += 1) {
    const card = document.createElement("article");
    card.className = "placeholder-card";
    card.setAttribute("aria-hidden", "true");
    card.style.setProperty("--card-index", String(Math.min(i, 6)));
    card.innerHTML = `
      <div class="placeholder-media"></div>
      <div class="placeholder-line placeholder-line-lg"></div>
      <div class="placeholder-line"></div>
      <div class="placeholder-pills">
        <span class="placeholder-pill"></span>
        <span class="placeholder-pill"></span>
      </div>
    `;
    fragment.appendChild(card);
  }
  els.results.appendChild(fragment);
  els.resultsMeta.textContent = "Loading launch schedule…";
  if (els.btnLoadMore) els.btnLoadMore.hidden = true;
  if (els.btnShowAll) els.btnShowAll.hidden = true;
}

// ----- Hero spotlight -----------------------------------------------------

export function renderHeroMeta() {
  const source = state.usingDemo
    ? "Demo data"
    : state.dataSource === "live"
      ? "Live data"
      : state.dataSource === "cache"
        ? "Cached data"
        : "Not loaded";
  if (els.dataSource) els.dataSource.textContent = source;
  if (els.lastUpdated) {
    els.lastUpdated.textContent = state.lastUpdated
      ? `Updated ${formatCompactDate(state.lastUpdated)}`
      : "Awaiting data";
  }
}

let lastHeroId = null;

// Replay a restrained content transition when the featured mission changes.
function triggerSpotlightEnter() {
  const el = els.nextLaunchCard;
  if (!el) return;
  el.classList.remove("motion-spotlight-enter");
  void el.offsetWidth; // restart
  el.classList.add("motion-spotlight-enter");
}

export function renderHero() {
  const launch = state.nextLaunch;

  if (!launch) {
    els.nextLaunchCard.innerHTML = `
      <div class="empty-state motion-fade-in">
        <strong>No matching mission</strong>
        <span>Adjust the organization tab or filters, load live data, or switch to demo mode.</span>
      </div>
    `;
    if (lastHeroId !== null) {
      lastHeroId = null;
      triggerSpotlightEnter();
    }
    return;
  }

  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const tags = orgTags(launch);
  const accent = tags.find((t) => t !== "nasa") || tags[0] || "";
  const status = normalizeStatus(launch);
  const isGo = status.key === "go";
  // Restrained final-hour emphasis (no aggressive flashing; reduced-motion safe).
  const ms = new Date(launch.net).getTime() - Date.now();
  const isFinalHour = Number.isFinite(ms) && ms > 0 && ms <= 60 * 60 * 1000;
  const ringClass = `countdown-ring${isFinalHour ? " is-final-hour" : ""}`;

  els.nextLaunchCard.dataset.accent = accent;

  els.nextLaunchCard.innerHTML = `
    <div class="spotlight-head">
      <span class="eyebrow">Featured mission</span>
      <div class="badge-row">${orgBadgesHtml(launch)}</div>
    </div>

    <div class="spotlight-main">
      <div class="spotlight-copy">
        <h2 class="spotlight-title">${escapeHtml(launch.name)}</h2>
        <div class="badge-row">
          ${missionTypeBadgeHtml(launch)}
          ${flightTypeBadgeHtml(launch)}
          <span class="badge ${statusBadgeClass(launch)}${isGo ? " status-go-emphasis" : ""}">${escapeHtml(status.label)}</span>
        </div>
        <dl class="spotlight-facts">
          <div><dt>Rocket</dt><dd>${escapeHtml(launch.rocket || "Unknown rocket")}</dd></div>
          <div><dt>Pad &amp; location</dt><dd>${escapeHtml(locationLabel || "TBA")}</dd></div>
          <div><dt>Launch time</dt><dd>${escapeHtml(formatDate(launch.net, launch.tzId))}</dd></div>
        </dl>
      </div>
      <div class="${ringClass}">
        <strong data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</strong>
        <span>Countdown</span>
      </div>
    </div>

    <div class="hero-weather" data-weather></div>

    <div class="card-actions">
      <button class="btn btn-primary" data-details-id="${escapeHtml(launch.id)}" type="button">View details</button>
      ${favoriteButtonHtml(launch, { variant: "hero" })}
      ${webcastActionHtml(launch)}
    </div>
  `;

  if ((launch.id || null) !== lastHeroId) {
    lastHeroId = launch.id || null;
    triggerSpotlightEnter();
  }
}

// ----- Mission overview ---------------------------------------------------
// Tile counts use documented semantics:
//  - "Showing" reflects the final filtered result set + current pagination.
//  - Organization tiles reflect the matching manifest after non-org filters but
//    BEFORE the active-org filter, so visitors can compare/switch organizations
//    without the other tiles collapsing to zero. Counts overlap intentionally.
//  - "Saved" reflects saved missions and updates immediately.

// Tile labels for each organization (provider-specific wording).
const ORG_TILE_LABELS = {
  nasa: "NASA missions",
  spacex: "SpaceX launches",
  "blue-origin": "Blue Origin flights",
  "rocket-lab": "Rocket Lab launches",
  ula: "ULA launches",
  firefly: "Firefly launches"
};

export function renderOverview() {
  const total = state.filteredLaunches.length;
  const visible = Math.min(state.visibleCount, total);
  const base = baseManifest();
  const saved = state.favorites.length;

  const showingDesc = `Showing ${visible} of ${total} matching launch${total === 1 ? "" : "es"}. Activate to show all tracked missions.`;

  const orgTile = (org) => {
    const value = base.filter(ORG_MATCHERS[org]).length;
    const activeAttr = state.activeOrg === org ? "true" : "false";
    return `
      <button class="overview-tile is-org" data-org="${org}" data-count-key="${org}" data-count="${value}" type="button" aria-pressed="${activeAttr}">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(ORG_TILE_LABELS[org])}</span>
      </button>`;
  };

  const orgOrder = [ORG.NASA, ...PROVIDER_ORGS];

  els.overviewTiles.innerHTML = `
    <button class="overview-tile is-showing" data-action="showing" type="button" aria-label="${escapeHtml(showingDesc)}">
      <strong>${escapeHtml(visible)} / ${escapeHtml(total)}</strong>
      <span aria-hidden="true">Showing</span>
    </button>
    ${orgOrder.map(orgTile).join("")}
    <button class="overview-tile is-saved" data-action="saved" data-count-key="saved" data-count="${saved}" type="button" aria-label="Open saved missions (${saved})">
      <strong>${escapeHtml(saved)}</strong>
      <span>Saved</span>
    </button>
  `;

  animateOverviewNumbers();
  renderActiveFilters();
  renderInsights();
}

// Animate single-number tile values from their previous value to the new one.
// Skips the first render (so cached values never animate up from zero), respects
// reduced-motion, and clamps very large jumps. The final value is already in the
// markup, so screen-reader / non-animated reads are accurate immediately.
let prevOverviewCounts = {};

function animateOverviewNumbers() {
  if (!els.overviewTiles) return;
  const reduce = prefersReducedMotion();
  els.overviewTiles.querySelectorAll("[data-count-key]").forEach((tile) => {
    const key = tile.getAttribute("data-count-key");
    const to = Number(tile.getAttribute("data-count"));
    const from = prevOverviewCounts[key];
    prevOverviewCounts[key] = to;
    const strong = tile.querySelector("strong");
    if (!strong) return;
    if (reduce || from === undefined || from === to || Math.abs(to - from) > 200) {
      strong.textContent = String(to);
      return;
    }
    countUp(strong, from, to);
  });
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function countUp(el, from, to) {
  const raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : (cb) => setTimeout(() => cb(nowMs()), 16);
  const duration = 320;
  const start = nowMs();
  const step = () => {
    const t = Math.min(1, (nowMs() - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) raf(step);
    else el.textContent = String(to);
  };
  raf(step);
}

// Reset the count-animation memory (e.g. before a skeleton load) so the first
// real render shows final values without animating up from zero.
export function resetOverviewCountMemory() {
  prevOverviewCounts = {};
}

// ----- Active-filter summary ----------------------------------------------
// A compact summary shown only while non-default filters are active, with a
// Clear all affordance. Updates on every filter/org change (called from
// renderOverview).

const DATE_RANGE_LABELS = {
  "24h": "Next 24 hours",
  "7d": "Next 7 days",
  "30d": "Next 30 days",
  year: "This year"
};
const SORT_LABELS = {
  latest: "Latest first",
  name: "Name A–Z",
  probability: "Highest probability",
  updated: "Recently updated"
};

export function renderActiveFilters() {
  if (!els.activeFilters) return;
  const chips = [];
  if (state.activeOrg !== "all") chips.push(ORG_LABELS[state.activeOrg] || state.activeOrg);
  if (state.keyword.trim()) chips.push(`Search: “${state.keyword.trim()}”`);
  if (state.missionType !== "all") chips.push(MISSION_TYPE_LABELS[state.missionType] || state.missionType);
  if (state.flightType !== "all") chips.push(FLIGHT_TYPE_LABELS[state.flightType] || state.flightType);
  if (state.dateRange !== "all") chips.push(DATE_RANGE_LABELS[state.dateRange] || state.dateRange);
  if (state.launchSite !== "all") chips.push(LAUNCH_SITE_LABELS[state.launchSite] || state.launchSite);
  if (state.orbit !== "all") chips.push(ORBIT_LABELS[state.orbit] || state.orbit);
  if (state.sortMode !== "soonest") chips.push(SORT_LABELS[state.sortMode] || state.sortMode);

  if (chips.length === 0) {
    els.activeFilters.hidden = true;
    els.activeFilters.innerHTML = "";
    return;
  }

  els.activeFilters.hidden = false;
  els.activeFilters.innerHTML = `
    <span class="active-filters-count">${chips.length} active filter${chips.length === 1 ? "" : "s"}</span>
    <span class="active-filters-list">${chips.map((c) => `<span class="active-filter-chip">${escapeHtml(c)}</span>`).join("")}</span>
    <button type="button" class="active-filters-clear" data-clear-filters aria-label="Clear all active filters">Clear all</button>
  `;
}

// ----- Mission insights ----------------------------------------------------
// Compact chips derived from the CURRENT filtered manifest (never all-time
// statistics). Recomputed alongside the overview tiles, so every org/filter/
// search change refreshes both.

export function renderInsights() {
  if (!els.insightsChips) return;
  const pool = state.filteredLaunches;
  const now = Date.now();
  const days7 = now + 7 * 24 * 60 * 60 * 1000;
  const days30 = now + 30 * 24 * 60 * 60 * 1000;
  const weatherHorizon = now + WEATHER_FORECAST_DAYS * 24 * 60 * 60 * 1000;

  const inWindow = (l, end) => {
    const t = new Date(l.net).getTime();
    return Number.isFinite(t) && t >= now && t <= end;
  };
  const within7 = pool.filter((l) => inWindow(l, days7)).length;
  const within30 = pool.filter((l) => inWindow(l, days30)).length;
  const webcasts = pool.filter((l) => safeUrl(l.webcast)).length;
  const orbital = pool.filter((l) => flightType(l) === "orbital").length;
  const suborbital = pool.filter((l) => flightType(l) === "suborbital").length;
  const crew = pool.filter((l) => classifyMissionType(l) === "crew").length;
  const science = pool.filter((l) => classifyMissionType(l) === "science").length;
  const sites = new Set(pool.map((l) => l.padName || l.location).filter(Boolean)).size;
  const weatherable = pool.filter((l) => {
    if (typeof l.padLat !== "number" || typeof l.padLon !== "number") return false;
    const t = new Date(l.net).getTime();
    return Number.isFinite(t) && t <= weatherHorizon;
  }).length;
  // Distinct tracked provider organizations represented in the filtered view.
  const providers = new Set();
  for (const l of pool) {
    for (const org of PROVIDER_ORGS) {
      if (ORG_MATCHERS[org](l)) providers.add(org);
    }
  }

  const chip = (value, label) => `
    <div class="insight-chip">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`;

  els.insightsChips.innerHTML =
    chip(within7, "Launches in the next 7 days") +
    chip(within30, "Launches in the next 30 days") +
    chip(webcasts, "Webcasts available") +
    chip(orbital, "Orbital missions") +
    chip(suborbital, "Suborbital flights") +
    chip(crew, "Crew missions") +
    chip(science, "Science missions") +
    chip(sites, "Active launch sites") +
    chip(weatherable, "Weather outlooks available") +
    chip(providers.size, "Providers represented");
}

// Keep organization tabs (and the active tile state) in sync with state.
export function renderOrgControls() {
  if (els.orgTabs) {
    els.orgTabs.querySelectorAll("[data-org]").forEach((tab) => {
      const selected = tab.getAttribute("data-org") === state.activeOrg;
      tab.setAttribute("aria-selected", String(selected));
      tab.classList.toggle("is-active", selected);
      tab.tabIndex = selected ? 0 : -1;
    });
  }
  if (els.overviewTiles) {
    els.overviewTiles.querySelectorAll(".is-org[data-org]").forEach((tile) => {
      tile.setAttribute("aria-pressed", String(tile.getAttribute("data-org") === state.activeOrg));
    });
  }
}

export function renderCoverageNote() {
  if (!els.coverageNote) return;
  if (state.truncated && state.launches.length > 0) {
    els.coverageNote.hidden = false;
    els.coverageNote.textContent = `Showing the next ${state.launches.length} tracked launches — some upcoming launches may not be listed.`;
  } else {
    els.coverageNote.hidden = true;
    els.coverageNote.textContent = "";
  }
}

// ----- Schedule cards -----------------------------------------------------

function buildLaunchCard(launch, index, { enter = false } = {}) {
  const image = resolveLaunchImage(launch);
  const stagger = Math.min(index, 8); // cap stagger so many cards stay fast

  // Subtle single provider accent (prefer the provider over the NASA overlay).
  const tags = orgTags(launch);
  const accent = tags.find((t) => t !== "nasa") || tags[0] || "";

  // No usable LL2 image (or a malformed URL) → quiet neutral placeholder that
  // preserves the card's media dimensions. Broken loads fall back to the same
  // panel via the global error handler in main.js.
  const media = image.src
    ? `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(launchImageAlt(launch))}" loading="lazy" />`
    : `<div class="media-fallback">No mission image available</div>`;

  const enterClass = enter ? " motion-card-enter" : "";

  return `
    <article class="launch-card${enterClass}" data-launch-id="${escapeHtml(launch.id)}" data-accent="${escapeHtml(accent)}" style="--card-index:${stagger}">
      <div class="launch-card-media">
        ${media}
        <div class="badge-row badge-float">${orgBadgesHtml(launch)}</div>
      </div>

      <div class="launch-card-body">
        <div class="card-status-row">
          ${statusBadgeHtml(launch)}
          <span class="card-relative">${escapeHtml(getRelativeLabel(launch.net))}</span>
        </div>

        <h3>${escapeHtml(launch.name)}</h3>
        <div class="card-meta">
          ${escapeHtml(formatDate(launch.net, launch.tzId))} • <span data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</span>
        </div>

        <div class="badge-row card-types">
          ${missionTypeBadgeHtml(launch)}
          ${flightTypeBadgeHtml(launch)}
        </div>

        <dl class="card-facts">
          <div><dt>Rocket</dt><dd>${escapeHtml(launch.rocket || "Unknown rocket")}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(concise(launch))}</dd></div>
        </dl>

        <div class="card-actions">
          <button class="btn btn-small btn-details" data-details-id="${escapeHtml(launch.id)}" type="button">Details</button>
          ${favoriteButtonHtml(launch, { variant: "grid" })}
        </div>
      </div>
    </article>
  `;
}

// entrance: "stagger" (per-card rise, capped) | "fade" (quick container fade,
// e.g. filter changes) | "none" (instant, e.g. cached render). append:true adds
// only the newly revealed cards (Load 10 more / Show all) so existing cards stay
// stable and only new ones animate in.
export function renderResults({ append = false, entrance = "none" } = {}) {
  if (state.launches.length === 0) {
    els.results.innerHTML = `
      <div class="empty-state motion-fade-in">
        <strong>No launches loaded yet</strong>
        <span>Use Refresh to bring the tracker to life, or try demo data.</span>
      </div>
    `;
    els.resultsMeta.textContent = "Nothing loaded yet.";
    els.btnLoadMore.hidden = true;
    els.btnShowAll.hidden = true;
    return;
  }

  const total = state.filteredLaunches.length;

  if (total === 0) {
    els.results.innerHTML = `
      <div class="empty-state motion-fade-in">
        <strong>No launches match your filters</strong>
        <span>Try a different organization, search, or reset the filters.</span>
      </div>
    `;
    els.resultsMeta.textContent = "0 matches";
    els.btnLoadMore.hidden = true;
    els.btnShowAll.hidden = true;
    return;
  }

  const visible = Math.min(state.visibleCount, total);

  if (append) {
    // Append only the cards that aren't on the page yet; existing cards (and
    // scroll position / focus) stay untouched. New cards animate in.
    const current = els.results.querySelectorAll(".launch-card").length;
    if (visible > current) {
      const html = state.filteredLaunches
        .slice(current, visible)
        .map((launch, i) => buildLaunchCard(launch, current + i, { enter: true }))
        .join("");
      els.results.insertAdjacentHTML("beforeend", html);
    }
  } else {
    const stagger = entrance === "stagger";
    els.results.innerHTML = state.filteredLaunches
      .slice(0, visible)
      .map((launch, i) => buildLaunchCard(launch, i, { enter: stagger }))
      .join("");
    if (entrance === "fade") pulseResults();
  }

  els.resultsMeta.textContent = `Showing ${visible} of ${total} launch${total === 1 ? "" : "es"}`;
  els.btnLoadMore.hidden = visible >= total;
  els.btnShowAll.hidden = visible >= total;
}

// A quick one-shot container fade for filter/replacement changes (no per-card
// entrance replay). Self-clears; reduced-motion makes it effectively instant.
function pulseResults() {
  const el = els.results;
  if (!el) return;
  el.classList.remove("motion-fade-in");
  void el.offsetWidth; // restart the animation
  el.classList.add("motion-fade-in");
}

// ----- Saved drawer -------------------------------------------------------

export function renderDrawer() {
  renderSavedCount();
  if (state.favorites.length === 0) {
    els.drawerList.innerHTML = `
      <div class="empty-state">
        <strong>No saved missions yet</strong>
        <span>Save launches to build a shortlist that survives refreshes.</span>
      </div>
    `;
    if (els.btnClearFavorites) els.btnClearFavorites.disabled = true;
    return;
  }

  if (els.btnClearFavorites) els.btnClearFavorites.disabled = false;
  els.drawerList.innerHTML = state.favorites
    .map((launch) => {
      return `
        <article class="saved-card">
          <div class="badge-row">
            ${orgBadgesHtml(launch)}
            <span class="badge">${escapeHtml(formatCompactDate(launch.net))}</span>
          </div>
          <h3>${escapeHtml(launch.name)}</h3>
          <p>${escapeHtml(concise(launch))} • ${escapeHtml(getRelativeLabel(launch.net))}</p>
          <div class="card-actions">
            <button class="btn btn-small btn-details" data-details-id="${escapeHtml(launch.id)}" type="button">Details</button>
            <button class="favorite-btn btn-small is-remove" data-favorite-id="${escapeHtml(launch.id)}" type="button" aria-label="Remove ${escapeHtml(launch.name)} from saved">× Remove</button>
          </div>
        </article>
      `;
    })
    .join("");
}

// ----- Details modal content ---------------------------------------------

// Keyless OpenStreetMap link for a launch pad. Built only from validated
// finite coordinates, run through safeUrl, and opened by the user on demand —
// no map tiles or third-party requests are loaded into the app itself.
function padMapSectionHtml(launch) {
  const lat = launch.padLat;
  const lon = launch.padLon;
  if (typeof lat !== "number" || typeof lon !== "number") return "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";

  const la = lat.toFixed(5);
  const lo = lon.toFixed(5);
  const url = safeUrl(
    `https://www.openstreetmap.org/?mlat=${encodeURIComponent(la)}&mlon=${encodeURIComponent(lo)}#map=15/${encodeURIComponent(la)}/${encodeURIComponent(lo)}`
  );
  if (!url) return "";

  const padLabel = launch.padName || "launch pad";
  const place = [launch.padName, launch.location].filter(Boolean).map(escapeHtml).join("<br />");
  return `
    <section class="pad-map">
      <h4 class="pad-map-heading">Launch pad map</h4>
      ${place ? `<p class="pad-map-place">${place}</p>` : ""}
      <a class="card-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`Open map for ${padLabel}`)}">Open pad map</a>
      <p class="pad-map-attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors.</p>
    </section>
  `;
}

export function buildDetailsContent(launch) {
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const officialUrl = launch.official; // already validated in api.js
  const wikiUrl = safeUrl(launch.wikipedia);

  const probabilityRow =
    launch.probability === null
      ? ""
      : `<div><dt>Launch probability</dt><dd>${escapeHtml(launch.probability)}%</dd></div>`;

  const providerRow = launch.providerName
    ? `<div><dt>Launch provider</dt><dd>${escapeHtml(launch.providerName)}</dd></div>`
    : "";
  const agencyNames = (launch.agencies || []).map((a) => a?.name).filter(Boolean).join(", ");
  const agencyRow = agencyNames
    ? `<div><dt>Mission agencies</dt><dd>${escapeHtml(agencyNames)}</dd></div>`
    : "";
  const orbitRow = launch.orbitName
    ? `<div><dt>Orbit</dt><dd>${escapeHtml(launch.orbitName)}</dd></div>`
    : "";

  const siteFormatted = siteDate(launch);
  const siteRow = siteFormatted
    ? `<div><dt>Launch (site time)</dt><dd>${escapeHtml(siteFormatted)}</dd></div>`
    : `<div><dt>Launch (site time)</dt><dd>Site timezone unavailable — showing local time above.</dd></div>`;

  const validNet = Number.isFinite(new Date(launch.net).getTime());
  const calendarAction = validNet
    ? `<button class="card-link" data-calendar-id="${escapeHtml(launch.id)}" type="button">Add to calendar</button>`
    : "";
  const shareAction = `<button class="card-link" data-share-id="${escapeHtml(launch.id)}" type="button">Copy mission link</button>`;

  return `
    <div class="details-head">
      <div class="badge-row">
        ${orgBadgesHtml(launch)}
        ${missionTypeBadgeHtml(launch)}
        ${flightTypeBadgeHtml(launch)}
        ${statusBadgeHtml(launch)}
      </div>
      <h2 id="detailsTitle" class="details-title">${escapeHtml(launch.name)}</h2>
    </div>

    <div class="details-countdown">
      <strong data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</strong>
      <span>Countdown</span>
    </div>

    <dl class="details-grid">
      <div><dt>Launch (local)</dt><dd>${escapeHtml(detailDate(launch.net, false))}</dd></div>
      <div><dt>Launch (UTC)</dt><dd>${escapeHtml(detailDate(launch.net, true))}</dd></div>
      ${siteRow}
      <div><dt>Rocket</dt><dd>${escapeHtml(launch.rocket || "Unknown rocket")}</dd></div>
      <div><dt>Pad &amp; location</dt><dd>${escapeHtml(locationLabel || "TBA")}</dd></div>
      ${providerRow}
      ${agencyRow}
      ${orbitRow}
      ${probabilityRow}
    </dl>

    <p class="details-description">
      ${escapeHtml(launch.details || "No mission description has been provided yet.")}
    </p>

    <section class="weather-block" data-weather aria-live="polite"></section>

    ${padMapSectionHtml(launch)}

    <div class="card-actions details-actions">
      ${favoriteButtonHtml(launch, { variant: "hero" })}
      ${webcastActionHtml(launch)}
      ${calendarAction}
      ${shareAction}
      ${officialUrl ? `<a class="card-link" href="${officialUrl}" target="_blank" rel="noopener">Official page</a>` : ""}
      ${wikiUrl ? `<a class="card-link" href="${wikiUrl}" target="_blank" rel="noopener">Wiki</a>` : ""}
    </div>
  `;
}

// ----- About this data ----------------------------------------------------

export function buildAboutContent() {
  const loaded = state.launches.length;
  const filtered = state.filteredLaunches.length;
  const source = state.usingDemo
    ? "Demo data"
    : state.dataSource === "live"
      ? "Live data"
      : state.dataSource === "cache"
        ? "Cached live data"
        : "Not loaded";
  const refreshed = state.lastUpdated ? formatCompactDate(state.lastUpdated) : "—";
  const coverage = state.truncated
    ? "Partial — more upcoming launches exist than were returned."
    : "Complete for the tracked providers.";

  const row = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

  return `
    <h2 id="aboutTitle" class="details-title">About this data</h2>
    <dl class="details-grid about-grid">
      ${row("Launch data", "Launch Library 2 (The Space Devs)")}
      ${row("Weather", "Open-Meteo")}
      ${row("Launch-pad maps", "OpenStreetMap")}
      ${row("Loaded missions", String(loaded))}
      ${row("Currently shown", String(filtered))}
      ${row("Last refresh", refreshed)}
      ${row("Data status", source)}
      ${row("Coverage", coverage)}
    </dl>
    <div class="about-orgs">
      <h3 class="about-subhead">Tracked organizations</h3>
      <div class="badge-row">
        <span class="badge org-badge org-nasa">NASA</span>
        <span class="badge org-badge org-spacex">SpaceX</span>
        <span class="badge org-badge org-blueorigin">Blue Origin</span>
        <span class="badge org-badge org-rocketlab">Rocket Lab</span>
        <span class="badge org-badge org-ula">ULA</span>
        <span class="badge org-badge org-firefly">Firefly</span>
      </div>
      <p class="about-note">
        NASA is a civil space <strong>agency</strong>; SpaceX, Blue Origin, Rocket Lab,
        ULA, and Firefly are launch <strong>providers</strong>. A NASA mission can also
        appear under its provider, so organization totals may overlap intentionally and
        are not expected to sum to the total.
      </p>
      <p class="about-note">
        Schedules, launch statuses, and webcast links may change at any time. This is
        not an official launch forecast.
      </p>
    </div>
  `;
}

// ----- Weather rendering --------------------------------------------------

function weatherRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function buildWeatherHtml(result, { compact = false } = {}) {
  const heading = `<h4 class="weather-heading">Local weather outlook</h4>`;
  const note = `<p class="weather-note">Weather data from Open-Meteo. Not an official launch forecast.</p>`;
  const wrap = (inner, extraNote = false) => `${heading}${inner}${extraNote ? note : ""}`;

  if (!result || result.status === "loading") {
    return wrap(`<p class="weather-msg">Loading local weather…</p>`);
  }
  if (result.status === "beyond-horizon") {
    return wrap(`<p class="weather-msg">Weather outlook available closer to launch.</p>`);
  }
  if (result.status === "unavailable-coords") {
    return wrap(`<p class="weather-msg">Local weather unavailable for this pad.</p>`);
  }
  if (result.status === "ok" && result.data) {
    const d = result.data;
    const u = d.units || {};
    const fmt = (v, unit) => (v === null || v === undefined ? "—" : `${Math.round(Number(v))}${unit || ""}`);
    const tempParts = formatTemperature(d.temperature);
    const temp = tempParts ? tempParts.text : "—";
    const condition = weatherCodeLabel(d.weatherCode);

    if (compact) {
      const precip =
        d.precipitationProbability === null || d.precipitationProbability === undefined
          ? ""
          : ` · ${Math.round(Number(d.precipitationProbability))}% precip`;
      return wrap(
        `<p class="weather-compact"><strong>${escapeHtml(condition)}</strong> · ${escapeHtml(temp)}${escapeHtml(precip)}</p>`,
        true
      );
    }

    const visKm =
      d.visibility === null || d.visibility === undefined
        ? "—"
        : `${Math.round(Number(d.visibility) / 1000)} km`;
    const rows = [
      weatherRow("Conditions", condition),
      weatherRow("Temperature", temp),
      weatherRow("Precipitation", d.precipitationProbability === null ? "—" : `${fmt(d.precipitationProbability, "%")}`),
      weatherRow("Cloud cover", d.cloudCover === null ? "—" : `${fmt(d.cloudCover, "%")}`),
      weatherRow("Visibility", visKm),
      weatherRow("Wind", fmt(d.windSpeed, ` ${u.wind_speed_10m || "km/h"}`)),
      weatherRow("Gusts", fmt(d.windGusts, ` ${u.wind_gusts_10m || "km/h"}`))
    ].join("");
    return wrap(`<dl class="weather-grid">${rows}</dl>`, true);
  }

  return wrap(`<p class="weather-msg">Weather outlook temporarily unavailable.</p>`);
}

export function renderWeatherInto(container, result, options = {}) {
  if (!container) return;
  container.innerHTML = buildWeatherHtml(result, options);
}

// ----- Countdowns & footer ------------------------------------------------

export function updateCountdownNodes() {
  document.querySelectorAll("[data-countdown]").forEach((node) => {
    node.textContent = getCountdownText(node.getAttribute("data-countdown"));
  });
}

export function refreshFooterMeta() {
  const pieces = [];
  pieces.push(state.usingDemo ? "Demo mode" : `Source: ${state.dataSource || "unknown"}`);
  pieces.push(`Time mode: ${state.dateMode.toUpperCase()}`);
  pieces.push(`Clock: ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`);
  els.footerMeta.textContent = pieces.join(" • ");
}

export function renderAll({ resultsEntrance = "none" } = {}) {
  renderHeroMeta();
  renderHero();
  renderOverview();
  renderResults({ entrance: resultsEntrance });
  renderDrawer();
  renderOrgControls();
  renderCoverageNote();
  updateCountdownNodes();
  refreshFooterMeta();
}
