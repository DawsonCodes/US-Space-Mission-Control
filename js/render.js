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
  getCountdownParts,
  validTimeZone
} from "./utils.js";
import { isFavorite } from "./storage.js";
import { apiUsageThisSession } from "./api.js";
import { hasActiveFilters, baseManifest } from "./filters.js";
import { WEATHER_FORECAST_DAYS } from "./config.js";
import {
  ORG,
  ORG_LABELS,
  ORG_BADGE_CLASS,
  PROVIDER_ORGS,
  ORG_MATCHERS,
  orgTags,
  classifyMissionType,
  missionTypeBadgeClass,
  MISSION_TYPE_LABELS,
  flightType,
  FLIGHT_TYPE_LABELS,
  ORBIT_LABELS,
  LAUNCH_SITE_LABELS,
  normalizeStatus,
  statusBadgeClass,
  launchOutcome,
  outcomeBadgeClass,
  OUTCOME_LABELS,
  OUTCOME_MEANING
} from "./organizations.js";
import { resolveLaunchImage, launchImageAlt, launchImageLabel } from "./images.js";
import {
  weatherCodeLabel,
  formatTemperature,
  formatSpeed,
  formatDistance
} from "./weather.js";
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
  refreshWindow: document.getElementById("refreshWindow"),
  refreshWindowText: document.getElementById("refreshWindowText"),
  footerMeta: document.getElementById("footerMeta"),
  btnUseDemo: document.getElementById("btnUseDemo"),
  btnAbout: document.getElementById("btnAbout"),
  btnLegend: document.getElementById("btnLegend"),
  aboutModal: document.getElementById("aboutModal"),
  aboutContent: document.getElementById("aboutContent"),
  legendModal: document.getElementById("legendModal"),
  btnPrevious: document.getElementById("btnPrevious"),
  previousModal: document.getElementById("previousModal"),
  previousContent: document.getElementById("previousContent"),
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

// The startup overlay covers the dashboard for at least three seconds, so a
// banner set during it was already a third spent before anyone could read it,
// and a short boot could burn most of it. While held, a banner shows without
// counting down; releasing starts the full duration from that moment.
let statusHeld = false;
let heldTone = null;

export function holdStatusCountdown() {
  statusHeld = true;
}

export function releaseStatusCountdown() {
  if (!statusHeld) return;
  statusHeld = false;
  // Whatever ended up on screen now gets its whole duration.
  if (heldTone && statusHasCountdown(heldTone) && els.status && !els.status.hidden) {
    runStatusCountdown();
  }
  heldTone = null;
}

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

  if (!withCountdown) return;
  if (statusHeld) {
    // The freshly written markup already reads the full duration and the bar
    // defaults to 100%, so leaving it alone is exactly "not started yet".
    heldTone = tone;
    return;
  }
  runStatusCountdown();
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

// ----- Organization accent stripe -----------------------------------------
// The coloured edge on a card. One organization gets a solid stripe; a shared
// mission (a NASA payload on a SpaceX rocket, say) splits the stripe into an
// equal band per organization, so you can tell at a glance whose launch it is
// and when two of them are flying it together.

const ORG_ACCENT_VAR = {
  [ORG.NASA]: "--org-nasa",
  [ORG.SPACEX]: "--org-spacex",
  [ORG.BLUE_ORIGIN]: "--org-blueorigin",
  [ORG.ROCKET_LAB]: "--org-rocketlab",
  [ORG.ULA]: "--org-ula",
  [ORG.FIREFLY]: "--org-firefly"
};

// Bands stay readable up to three; beyond that the stripe would be mush.
const MAX_ACCENT_BANDS = 3;

// The stripe references the live :root tokens rather than resolved hex values,
// so a colour customized in the panel restyles every stripe immediately.
export function accentStripe(launch) {
  // NASA leads when it is on the mission. It is the agency whose payload is
  // flying, it reads first in the badge row, and it makes the top band the one
  // that names the mission rather than the rocket.
  const tags = orgTags(launch).filter((tag) => ORG_ACCENT_VAR[tag]);
  const ordered = [...tags.filter((t) => t === ORG.NASA), ...tags.filter((t) => t !== ORG.NASA)];
  const bands = ordered.slice(0, MAX_ACCENT_BANDS);

  if (bands.length === 0) return { primary: "", bands: 0, style: "" };
  return {
    primary: bands[0],
    bands: bands.length,
    style: bands.map((tag, i) => `--accent-${i + 1}:var(${ORG_ACCENT_VAR[tag]})`).join(";")
  };
}

// Ready-made attributes for an element that should carry the stripe.
function accentAttrs(launch, extraStyle = "") {
  const stripe = accentStripe(launch);
  if (!stripe.bands) return extraStyle ? ` style="${escapeHtml(extraStyle)}"` : "";
  const style = [stripe.style, extraStyle].filter(Boolean).join(";");
  return ` data-accent="${escapeHtml(stripe.primary)}" data-accent-bands="${stripe.bands}" style="${escapeHtml(style)}"`;
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

// Inner markup for a save/saved button. The star is its own element so it can
// be tinted gold while the rest of the pill stays green (and so the confetti
// burst has something to originate from).
export function favoriteButtonInner(active) {
  return `<span class="fav-star" aria-hidden="true">${active ? "★" : "☆"}</span><span class="fav-label">${active ? "Saved" : "Save"}</span>`;
}

function favoriteButtonHtml(launch, { variant = "grid" } = {}) {
  const active = isFavorite(launch.id);
  const cls = variant === "hero" ? "favorite-btn" : "favorite-btn btn-small";
  const aria = active ? `Remove ${launch.name} from saved` : `Save ${launch.name}`;
  return `<button class="${cls} ${active ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button" aria-pressed="${active}" aria-label="${escapeHtml(aria)}">${favoriteButtonInner(active)}</button>`;
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
      btn.innerHTML = favoriteButtonInner(fav);
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
  // Counts are about to be replaced by a fresh dataset — drop the remembered
  // values so the first real render shows finals instead of animating up from
  // the previous manifest's numbers.
  resetOverviewCountMemory();

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

// One place decides how a data source is described, so the hero pill, the About
// panel and the footer can never disagree. "snapshot" is the published file,
// "live" is a direct API call, "dev" is the development mirror behind the Debug
// switch, and "cache" is this browser's saved copy.
export function dataSourceLabel() {
  if (state.usingDemo) return "Debug data";
  switch (state.dataSource) {
    case "snapshot": return "Published data";
    case "snapshot-stale": return "Published data (old)";
    case "live": return "Live data";
    case "dev": return "Development mirror";
    case "cache": return "Saved data";
    default: return "Not loaded";
  }
}

export function renderHeroMeta() {
  const source = dataSourceLabel();
  if (els.dataSource) els.dataSource.textContent = source;
  if (els.lastUpdated) {
    els.lastUpdated.textContent = state.lastUpdated
      ? `Updated ${formatCompactDate(state.lastUpdated)}`
      : "Awaiting data";
  }
}

// ANIM-29 — Segmented countdown (days / hours / minutes / seconds). The visible
// digits are decorative and aria-hidden; a .sr-only text copy carries the value
// for assistive tech WITHOUT an aria-live region (which would otherwise announce
// every single second).
const CD_UNITS = [
  ["days", "Days"],
  ["hours", "Hrs"],
  ["minutes", "Min"],
  ["seconds", "Sec"]
];

// The same keys as a set, so the tick can validate a cell's data-cd without
// walking CD_UNITS for every cell on the page.
const CD_KEYS = new Set(CD_UNITS.map(([key]) => key));

function pad2(n) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function countdownUnitsHtml(net, { compact = false } = {}) {
  const parts = getCountdownParts(net);
  const label = getCountdownText(net);

  if (!parts || parts.passed) {
    return `<strong class="countdown-flat${compact ? " is-compact" : ""}" data-countdown="${escapeHtml(net)}">${escapeHtml(label)}</strong>`;
  }

  const cells = CD_UNITS.map(
    ([key, short]) => `
      <span class="cd-unit">
        <b class="cd-value" data-cd="${key}">${escapeHtml(key === "days" ? String(parts.days) : pad2(parts[key]))}</b>
        <i class="cd-label">${escapeHtml(short)}</i>
      </span>`
  ).join('<span class="cd-sep" aria-hidden="true">:</span>');

  return `
    <span class="sr-only" data-countdown="${escapeHtml(net)}">${escapeHtml(label)}</span>
    <span class="countdown-units${compact ? " is-compact" : ""}" data-countdown-parts="${escapeHtml(net)}" aria-hidden="true">${cells}</span>`;
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
        ${countdownUnitsHtml(launch.net)}
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
    // The Saved tile updates instantly — a rolling count there reads as noise
    // rather than feedback when you save or remove a mission.
    if (key === "saved" || reduce || from === undefined || from === to || Math.abs(to - from) > 200) {
      strong.textContent = String(to);
      return;
    }
    countUp(strong, from, to);
    // ANIM-12: pop the digits so a changed count is felt, not just read.
    strong.classList.remove("is-bumped");
    void strong.offsetWidth; // restart the animation
    strong.classList.add("is-bumped");
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
    els.coverageNote.textContent = `Showing the next ${state.launches.length} tracked launches. A few of the furthest-out ones are not listed.`;
  } else {
    els.coverageNote.hidden = true;
    els.coverageNote.textContent = "";
  }
}

// ----- Schedule cards -----------------------------------------------------

function buildLaunchCard(launch, index, { enter = false } = {}) {
  const image = resolveLaunchImage(launch);
  const stagger = Math.min(index, 8); // cap stagger so many cards stay fast

  // No usable LL2 image (or a malformed URL) → quiet neutral placeholder that
  // preserves the card's media dimensions. Broken loads fall back to the same
  // panel via the global error handler in main.js.
  const media = image.src
    ? `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(launchImageAlt(launch))}" loading="lazy" />`
    : `<div class="media-fallback">No mission image available</div>`;

  const enterClass = enter ? " motion-card-enter" : "";

  return `
    <article class="launch-card${enterClass}" data-launch-id="${escapeHtml(launch.id)}"${accentAttrs(launch, `--card-index:${stagger}`)}>
      <div class="launch-card-media">
        ${media}
        <div class="badge-row badge-float">${orgBadgesHtml(launch)}</div>
      </div>

      <div class="launch-card-body">
        <div class="card-status-row">
          ${statusBadgeHtml(launch)}
          ${countdownUnitsHtml(launch.net, { compact: true })}
        </div>

        <h3>${escapeHtml(launch.name)}</h3>
        <div class="card-meta">${escapeHtml(formatDate(launch.net, launch.tzId))}</div>

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
        <span>Launch data is loading. It updates automatically.</span>
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
      <div class="saved-empty">
        <span class="saved-empty-icon" aria-hidden="true">☆</span>
        <strong>Nothing saved yet</strong>
        <span class="saved-empty-text">
          Use Save on any mission to keep it here. Saved missions stay put across
          refreshes and new visits.
        </span>
      </div>
    `;
    if (els.btnClearFavorites) els.btnClearFavorites.disabled = true;
    return;
  }

  if (els.btnClearFavorites) els.btnClearFavorites.disabled = false;

  const now = Date.now();
  // Soonest first, so the drawer reads as a shortlist you work down. Launches
  // whose time has passed sink to the bottom instead of leading the list.
  const ordered = [...state.favorites].sort((a, b) => {
    const at = new Date(a.net).getTime();
    const bt = new Date(b.net).getTime();
    const av = Number.isFinite(at) ? at : Infinity;
    const bv = Number.isFinite(bt) ? bt : Infinity;
    const aPast = av < now;
    const bPast = bv < now;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return av - bv;
  });

  const upcoming = ordered.filter((l) => {
    const t = new Date(l.net).getTime();
    return !Number.isFinite(t) || t >= now;
  }).length;

  const summary = `
    <p class="saved-summary">
      ${escapeHtml(String(ordered.length))} saved,
      ${escapeHtml(String(upcoming))} still ahead
    </p>`;

  const cards = ordered
    .map((launch) => {
      const past = new Date(launch.net).getTime() < now;
      const timing = past
        ? `<span class="saved-flown">Already flown</span>`
        : countdownUnitsHtml(launch.net, { compact: true });

      return `
        <article class="saved-card${past ? " is-past" : ""}"${accentAttrs(launch)}>
          <div class="saved-card-head">
            <div class="badge-row">${orgBadgesHtml(launch)}</div>
            <button
              class="saved-remove"
              data-favorite-id="${escapeHtml(launch.id)}"
              type="button"
              title="Remove from saved"
              aria-label="Remove ${escapeHtml(launch.name)} from saved"
            >✕</button>
          </div>

          <h3 class="saved-name">${escapeHtml(launch.name)}</h3>

          <p class="saved-meta">
            <span class="saved-date">${escapeHtml(formatCompactDate(launch.net))}</span>
            <span class="saved-place">${escapeHtml(concise(launch))}</span>
          </p>

          <div class="saved-foot">
            ${timing}
            <button class="btn btn-small btn-details" data-details-id="${escapeHtml(launch.id)}" type="button">Details</button>
          </div>
        </article>
      `;
    })
    .join("");

  els.drawerList.innerHTML = `${summary}<div class="saved-stack">${cards}</div>`;
}

// ----- Details modal content ---------------------------------------------

// Keyless OpenStreetMap link for a launch pad. Built only from validated
// finite coordinates, run through safeUrl, and opened by the user on demand —
// no map tiles or third-party requests are loaded into the app itself.
// Mission or rocket imagery for the detail views. Same resolver the cards use,
// so it falls back to the neutral placeholder rather than stand-in artwork, and
// it carries the compositor hints that keep the bitmap from resampling.
function detailsMediaHtml(launch) {
  const { src, kind } = resolveLaunchImage(launch);
  if (!src) {
    return `
      <div class="details-media is-empty" aria-hidden="true">
        <span>No mission image available</span>
      </div>`;
  }
  return `
    <figure class="details-media">
      <img src="${src}" alt="${escapeHtml(launchImageAlt(launch))}" loading="lazy" decoding="async" />
      <figcaption>${escapeHtml(launchImageLabel(kind))} from Launch Library 2</figcaption>
    </figure>`;
}

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

    ${detailsMediaHtml(launch)}

    <div class="details-countdown">
      ${countdownUnitsHtml(launch.net)}
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
  const source = dataSourceLabel();
  const refreshed = state.lastUpdated ? formatCompactDate(state.lastUpdated) : "—";
  const coverage = state.truncated
    ? `Partial. Showing the soonest ${loaded} launches; more are scheduled beyond them.`
    : "Complete for the tracked providers.";

  const row = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

  // What the data actually costs. The scheduled run's spend is published in the
  // snapshot; this browser's is counted locally and should read zero on the
  // normal path, which is the whole point of publishing the file.
  const spend = state.apiUsage;
  const mine = apiUsageThisSession();
  const perHour = spend ? spend.requests * (spend.runsPerHour || 2) : null;

  const usageRows = [
    spend
      ? row(
          "Scheduled run cost",
          `${spend.requests} request${spend.requests === 1 ? "" : "s"}` +
            (spend.retries ? `, ${spend.retries} of them retries` : "") +
            (spend.byFeed
              ? ` (${Object.entries(spend.byFeed).map(([k, v]) => `${k} ${v}`).join(", ")})`
              : "")
        )
      : "",
    perHour !== null
      ? row(
          "Spend per hour",
          `About ${perHour} of ${spend.hourlyBudget || 15} allowed, across ${spend.runsPerHour || 2} runs`
        )
      : "",
    row(
      "This browser has spent",
      mine.requests === 0
        ? "0 requests. Published data is a static file, not an API call."
        : `${mine.requests} request${mine.requests === 1 ? "" : "s"} (${Object.entries(mine.byHost).map(([k, v]) => `${k} ${v}`).join(", ")})`
    )
  ]
    .filter(Boolean)
    .join("");

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

    <h3 class="about-subhead">API usage</h3>
    <dl class="details-grid about-grid">
      ${usageRows}
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
        NASA is an agency; the other five are launch providers. A NASA mission
        also counts under whoever flies it, so the totals overlap on purpose.
      </p>
      <p class="about-note">
        Schedules, statuses and webcast links change often. This is not an
        official launch forecast.
      </p>
    </div>
  `;
}

// ----- Weather rendering --------------------------------------------------

function weatherRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function buildWeatherHtml(result, { compact = false, recorded = false } = {}) {
  const heading = recorded
    ? `<h4 class="weather-heading">Weather recorded at launch</h4>`
    : `<h4 class="weather-heading">Local weather outlook</h4>`;
  const note = recorded
    ? `<p class="weather-note">Conditions recorded at the pad for the launch hour, from Open-Meteo.</p>`
    : `<p class="weather-note">Weather data from Open-Meteo. Not an official launch forecast.</p>`;
  const wrap = (inner, extraNote = false) => `${heading}${inner}${extraNote ? note : ""}`;

  if (!result || result.status === "loading") {
    return wrap(
      `<p class="weather-msg">${recorded ? "Loading recorded conditions…" : "Loading local weather…"}</p>`
    );
  }
  if (result.status === "beyond-horizon") {
    return wrap(`<p class="weather-msg">Weather outlook available closer to launch.</p>`);
  }
  if (result.status === "beyond-archive") {
    return wrap(`<p class="weather-msg">No recorded weather is available this far back.</p>`);
  }
  if (result.status === "unavailable-coords") {
    return wrap(`<p class="weather-msg">Local weather unavailable for this pad.</p>`);
  }
  if (result.status === "ok" && result.data) {
    const d = result.data;
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

    // American units first, then metric, the same way temperature is shown.
    const visibility = formatDistance(d.visibility);
    const wind = formatSpeed(d.windSpeed);
    const gusts = formatSpeed(d.windGusts);
    const rows = [
      weatherRow("Conditions", condition),
      weatherRow("Temperature", temp),
      weatherRow("Precipitation", d.precipitationProbability === null ? "—" : `${fmt(d.precipitationProbability, "%")}`),
      weatherRow("Cloud cover", d.cloudCover === null ? "—" : `${fmt(d.cloudCover, "%")}`),
      weatherRow("Visibility", visibility ? visibility.text : "—"),
      weatherRow("Wind", wind ? wind.text : "—"),
      weatherRow("Gusts", gusts ? gusts.text : "—")
    ].join("");
    return wrap(`<dl class="weather-grid">${rows}</dl>`, true);
  }

  return wrap(
    `<p class="weather-msg">${recorded ? "Recorded conditions are unavailable for this launch." : "Weather outlook temporarily unavailable."}</p>`
  );
}

export function renderWeatherInto(container, result, options = {}) {
  if (!container) return;
  container.innerHTML = buildWeatherHtml(result, options);
}

// ----- Countdowns & footer ------------------------------------------------

// Restarting a CSS animation means the browser has to observe the class as
// absent, which is what reading offsetWidth forces. Doing that inside the loop
// interleaved a write and a layout read per cell, so on a fully expanded page
// every one of the ~226 countdown cells flushed document layout on every tick.
// That is roughly a third of each second spent in blocking layout, which the 1s
// interval cannot absorb: it drifts, and the details-modal countdown skips
// seconds. Same work, reordered into read, write, one flush, write, so a tick
// forces layout once instead of once per cell.
//
// ANIM-29 — the segmented display rolls only the digits whose value actually
// changed, so the seconds roll every tick but the days sit still.
export function updateCountdownNodes() {
  const pending = [];

  // Pass 1: read only. Nothing here invalidates layout.
  for (const node of document.querySelectorAll("[data-countdown]")) {
    const next = getCountdownText(node.getAttribute("data-countdown"));
    if (node.textContent === next) continue; // no DOM write when nothing changed
    // ANIM-08: the details-modal countdown breathes on a real change; the hero
    // uses the richer segmented roll below.
    const replay = node.parentElement?.classList?.contains("details-countdown")
      ? "is-ticking"
      : null;
    pending.push({ el: node, text: next, replay });
  }

  for (const box of document.querySelectorAll("[data-countdown-parts]")) {
    const parts = getCountdownParts(box.getAttribute("data-countdown-parts"));
    if (!parts) continue;
    // One query per box rather than one per unit. With the whole manifest on
    // screen the old form issued about 900 selector lookups a second.
    for (const cell of box.querySelectorAll("[data-cd]")) {
      const key = cell.getAttribute("data-cd");
      if (!CD_KEYS.has(key)) continue;
      const next = key === "days" ? String(parts.days) : pad2(parts[key]);
      if (cell.textContent === next) continue;
      pending.push({ el: cell, text: next, replay: "is-rolling" });
    }
  }

  if (pending.length === 0) return;

  // Pass 2: writes only. Clear every animation class that is about to replay.
  let replaying = false;
  for (const change of pending) {
    if (!change.replay) continue;
    change.el.classList.remove(change.replay);
    replaying = true;
  }

  // Pass 3: the single forced layout for the whole tick, so those removals are
  // observed before the classes go back on.
  if (replaying) void document.body.offsetWidth;

  // Pass 4: writes only. No read follows, so the browser batches this normally.
  for (const change of pending) {
    change.el.textContent = change.text;
    if (change.replay) change.el.classList.add(change.replay);
  }
}

// Built once and reused. Constructing an Intl formatter resolves the locale
// every time, and this runs on every countdown tick.
let clockFormat = null;
function clockFormatter() {
  if (!clockFormat) {
    clockFormat = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }
  return clockFormat;
}

export function refreshFooterMeta() {
  const pieces = [];
  pieces.push(dataSourceLabel());
  pieces.push(`Time mode: ${state.dateMode.toUpperCase()}`);
  pieces.push(`Clock: ${clockFormatter().format(new Date())}`);
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


// ----- Previous launches --------------------------------------------------
// A lazy, self-contained panel listing recently completed launches from the
// tracked providers, with an honest outcome label, the published cause when a
// launch failed, and a link to watch the launch back.

export function buildPreviousContent(
  launches,
  { state: viewState = "ok", message = "", retry = true } = {}
) {
  const head = `<h2 id="previousTitle" class="details-title">Previous launches</h2>`;

  if (viewState === "loading") {
    return `${head}<p class="previous-note">Loading recent launches…</p>`;
  }
  if (viewState === "error") {
    // Retrying into a rate limit only extends it, so the action is withheld.
    return `${head}
      <p class="previous-note is-error">${escapeHtml(message || "Couldn't load previous launches.")}</p>
      ${retry ? `<button class="btn" type="button" data-previous-retry>Try again</button>` : ""}`;
  }
  if (!Array.isArray(launches) || launches.length === 0) {
    return `${head}<p class="previous-note">No recent launches were returned for the tracked providers.</p>`;
  }

  const rows = launches
    .map((launch) => {
      const outcome = launchOutcome(launch);
      const replay = safeUrl(launch.webcast);

      // Only failure/partial get a cause line, and we never invent one.
      const cause =
        outcome === "failure" || outcome === "partial"
          ? `<p class="previous-cause">
               <strong>What went wrong:</strong>
               ${escapeHtml(launch.failReason || "No official cause has been published.")}
             </p>`
          : "";

      const watch = replay
        ? `<a class="card-link btn-small" href="${replay}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`Watch ${launch.name}`)}">▶ Watch launch</a>`
        : `<span class="previous-nowatch">No video available</span>`;

      return `
        <article class="previous-item"${accentAttrs(launch)}>
          <div class="badge-row">
            ${orgBadgesHtml(launch)}
            <span class="badge ${outcomeBadgeClass(outcome)}">${escapeHtml(OUTCOME_LABELS[outcome])}</span>
          </div>
          <h3 class="previous-name">${escapeHtml(launch.name)}</h3>
          <p class="previous-meta">
            ${escapeHtml(formatDate(launch.net, launch.tzId))}
            ${launch.rocket ? ` • ${escapeHtml(launch.rocket)}` : ""}
            ${launch.location ? ` • ${escapeHtml(launch.location)}` : ""}
          </p>
          <p class="previous-meaning">${escapeHtml(OUTCOME_MEANING[outcome])}</p>
          ${cause}
          <div class="card-actions">
            <button class="btn btn-small btn-details" data-previous-id="${escapeHtml(launch.id)}" type="button">View details</button>
            ${watch}
          </div>
        </article>`;
    })
    .join("");

  return `${head}
    <p class="previous-note">
      The ${launches.length} most recent completed launches from the tracked providers.
      Outcomes and any published failure cause come from Launch Library 2.
    </p>
    <div class="previous-list">${rows}</div>`;
}

// ----- Previous-launch detail ---------------------------------------------
// Rendered inside the Previous launches panel rather than the mission-details
// modal, so the Back action returns you to the list you were reading.

export function buildPreviousDetail(launch, { weather } = {}) {
  if (!launch) {
    return `<h2 id="previousTitle" class="details-title">Launch not found</h2>
      <button class="btn" type="button" data-previous-back>Back to previous launches</button>`;
  }

  const outcome = launchOutcome(launch);
  const replay = safeUrl(launch.webcast);
  const officialUrl = safeUrl(launch.official);
  const wikiUrl = safeUrl(launch.wikipedia);
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");

  const cause =
    outcome === "failure" || outcome === "partial"
      ? `<p class="previous-cause">
           <strong>What went wrong:</strong>
           ${escapeHtml(launch.failReason || "No official cause has been published.")}
         </p>`
      : "";

  const row = (label, value) =>
    value ? `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

  const agencyNames = (launch.agencies || []).map((a) => a?.name).filter(Boolean).join(", ");

  return `
    <button class="btn btn-small previous-back" type="button" data-previous-back>← Back to previous launches</button>

    <div class="details-head previous-detail-head"${accentAttrs(launch)}>
      <div class="badge-row">
        ${orgBadgesHtml(launch)}
        ${missionTypeBadgeHtml(launch)}
        ${flightTypeBadgeHtml(launch)}
        <span class="badge ${outcomeBadgeClass(outcome)}">${escapeHtml(OUTCOME_LABELS[outcome])}</span>
      </div>
      <h2 id="previousTitle" class="details-title">${escapeHtml(launch.name)}</h2>
      <p class="previous-meaning">${escapeHtml(OUTCOME_MEANING[outcome])}</p>
      ${cause}
    </div>

    ${detailsMediaHtml(launch)}

    <dl class="details-grid">
      ${row("Launched (local)", detailDate(launch.net, false))}
      ${row("Launched (UTC)", detailDate(launch.net, true))}
      ${row("Rocket", launch.rocket || "Unknown rocket")}
      ${row("Pad & location", locationLabel || "Not published")}
      ${row("Launch provider", launch.providerName)}
      ${row("Mission agencies", agencyNames)}
      ${row("Orbit", launch.orbitName)}
    </dl>

    <p class="details-description">
      ${escapeHtml(launch.details || "No mission description has been provided yet.")}
    </p>

    <section class="weather-block" data-previous-weather aria-live="polite">
      ${buildWeatherHtml(weather || { status: "loading" }, { recorded: true })}
    </section>

    ${padMapSectionHtml(launch)}

    <div class="card-actions details-actions">
      ${replay ? `<a class="card-link" href="${replay}" target="_blank" rel="noopener noreferrer">▶ Watch launch</a>` : `<span class="previous-nowatch">No video available</span>`}
      ${officialUrl ? `<a class="card-link" href="${officialUrl}" target="_blank" rel="noopener">Official page</a>` : ""}
      ${wikiUrl ? `<a class="card-link" href="${wikiUrl}" target="_blank" rel="noopener">Wiki</a>` : ""}
    </div>
  `;
}
