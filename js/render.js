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
  getCountdownText
} from "./utils.js";
import { isFavorite } from "./storage.js";
import { hasActiveFilters, baseManifest } from "./filters.js";
import {
  ORG,
  ORG_LABELS,
  ORG_BADGE_CLASS,
  orgTags,
  isNASA,
  isSpaceX,
  isBlueOrigin,
  classifyMissionType,
  missionTypeBadgeClass,
  MISSION_TYPE_LABELS,
  flightType,
  FLIGHT_TYPE_LABELS,
  normalizeStatus,
  statusBadgeClass
} from "./organizations.js";
import { resolveLaunchImage, launchImageAlt } from "./images.js";
import { weatherCodeLabel, formatTemperature } from "./weather.js";

export const els = {
  status: document.getElementById("status"),
  keyword: document.getElementById("keyword"),
  missionType: document.getElementById("missionType"),
  flightType: document.getElementById("flightType"),
  sortMode: document.getElementById("sortMode"),
  dateMode: document.getElementById("dateMode"),
  results: document.getElementById("results"),
  resultsMeta: document.getElementById("resultsMeta"),
  coverageNote: document.getElementById("coverageNote"),
  overviewTiles: document.getElementById("overviewTiles"),
  orgTabs: document.getElementById("orgTabs"),
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
// removed) auto-dismiss after EXACTLY 10s, driven by a single deadline
// timestamp: both the visible seconds and the progress-bar width are derived
// from the same remaining-time value every tick, so they can never desync.
// There is NO hover/focus pausing. "loading" and "error" persist (no countdown)
// until replaced or dismissed.

const STATUS_DURATION_MS = 10000;
const STATUS_TICK_MS = 250;
const PERSISTENT_TONES = new Set(["loading", "error"]);
let statusInterval = null;
let statusDeadline = 0;

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
  const remaining = Math.max(0, statusDeadline - Date.now());
  const secs = Math.ceil(remaining / 1000);
  const count = el.querySelector("[data-status-count]");
  if (count) count.textContent = `${secs}s`;
  const bar = el.querySelector("[data-status-progress]");
  if (bar) bar.style.width = `${(remaining / STATUS_DURATION_MS) * 100}%`;
}

function runStatusCountdown() {
  clearStatusInterval();
  statusDeadline = Date.now() + STATUS_DURATION_MS;
  paintStatusCountdown();
  statusInterval = window.setInterval(() => {
    paintStatusCountdown();
    if (Date.now() >= statusDeadline) dismissStatus();
  }, STATUS_TICK_MS);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function dismissStatus() {
  clearStatusInterval();
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

export function setLoadingState() {
  els.results.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 6; i += 1) {
    const card = document.createElement("article");
    card.className = "placeholder-card";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `
      <div class="placeholder-line placeholder-line-lg"></div>
      <div class="placeholder-line"></div>
      <div class="placeholder-line"></div>
      <div class="placeholder-pills">
        <span class="placeholder-pill"></span>
        <span class="placeholder-pill"></span>
      </div>
    `;
    fragment.appendChild(card);
  }
  els.results.appendChild(fragment);
  els.resultsMeta.textContent = "Loading launch schedule...";
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

export function renderHero() {
  const launch = state.nextLaunch;

  if (!launch) {
    els.nextLaunchCard.innerHTML = `
      <div class="empty-state">
        <strong>No matching mission</strong>
        <span>Adjust the organization tab or filters, load live data, or switch to demo mode.</span>
      </div>
    `;
    return;
  }

  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const webcastUrl = safeUrl(launch.webcast);

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
          ${statusBadgeHtml(launch)}
        </div>
        <dl class="spotlight-facts">
          <div><dt>Rocket</dt><dd>${escapeHtml(launch.rocket || "Unknown rocket")}</dd></div>
          <div><dt>Pad &amp; location</dt><dd>${escapeHtml(locationLabel || "TBA")}</dd></div>
          <div><dt>Launch time</dt><dd>${escapeHtml(formatDate(launch.net))}</dd></div>
        </dl>
      </div>
      <div class="countdown-ring">
        <strong data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</strong>
        <span>Countdown</span>
      </div>
    </div>

    <div class="hero-weather" data-weather></div>

    <div class="card-actions">
      <button class="btn btn-primary" data-details-id="${escapeHtml(launch.id)}" type="button">View details</button>
      ${favoriteButtonHtml(launch, { variant: "hero" })}
      ${webcastUrl ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Watch webcast</a>` : ""}
    </div>
  `;
}

// ----- Mission overview ---------------------------------------------------
// Tile counts use documented semantics:
//  - "Showing" reflects the final filtered result set + current pagination.
//  - Organization tiles reflect the matching manifest after non-org filters but
//    BEFORE the active-org filter, so visitors can compare/switch organizations
//    without the other tiles collapsing to zero. Counts overlap intentionally.
//  - "Saved" reflects saved missions and updates immediately.

export function renderOverview() {
  const total = state.filteredLaunches.length;
  const visible = Math.min(state.visibleCount, total);
  const base = baseManifest();
  const nasa = base.filter(isNASA).length;
  const spacex = base.filter(isSpaceX).length;
  const blue = base.filter(isBlueOrigin).length;
  const saved = state.favorites.length;

  const showingDesc = `Showing ${visible} of ${total} matching launch${total === 1 ? "" : "es"}`;

  const orgTile = (org, value, label) => {
    const activeAttr = state.activeOrg === org ? "true" : "false";
    return `
      <button class="overview-tile is-org" data-org="${org}" type="button" aria-pressed="${activeAttr}">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </button>`;
  };

  els.overviewTiles.innerHTML = `
    <div class="overview-tile is-showing" aria-label="${escapeHtml(showingDesc)}">
      <strong>${escapeHtml(visible)} / ${escapeHtml(total)}</strong>
      <span aria-hidden="true">Showing</span>
    </div>
    ${orgTile(ORG.NASA, nasa, "NASA missions")}
    ${orgTile(ORG.SPACEX, spacex, "SpaceX launches")}
    ${orgTile(ORG.BLUE_ORIGIN, blue, "Blue Origin flights")}
    <button class="overview-tile is-saved" data-action="saved" type="button" aria-label="Open saved missions (${saved})">
      <strong>${escapeHtml(saved)}</strong>
      <span>Saved</span>
    </button>
  `;
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

function buildLaunchCard(launch, index) {
  const image = resolveLaunchImage(launch);
  const favoriteActive = isFavorite(launch.id);
  const stagger = Math.min(index, 10);

  return `
    <article class="launch-card" data-launch-id="${escapeHtml(launch.id)}" style="--card-index:${stagger}">
      <div class="launch-card-media">
        <img src="${escapeHtml(image.src)}" alt="${escapeHtml(launchImageAlt(launch))}" loading="lazy" />
        <div class="badge-row badge-float">${orgBadgesHtml(launch)}</div>
      </div>

      <div class="launch-card-body">
        <div class="card-status-row">
          ${statusBadgeHtml(launch)}
          <span class="card-relative">${escapeHtml(getRelativeLabel(launch.net))}</span>
        </div>

        <h3>${escapeHtml(launch.name)}</h3>
        <div class="card-meta">
          ${escapeHtml(formatDate(launch.net))} • <span data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</span>
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

export function renderResults() {
  if (state.launches.length === 0) {
    els.results.innerHTML = `
      <div class="empty-state">
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
      <div class="empty-state">
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
  els.results.innerHTML = state.filteredLaunches
    .slice(0, visible)
    .map((launch, i) => buildLaunchCard(launch, i))
    .join("");

  els.resultsMeta.textContent = `Showing ${visible} of ${total} launch${total === 1 ? "" : "es"}`;
  els.btnLoadMore.hidden = visible >= total;
  els.btnShowAll.hidden = visible >= total;
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

export function buildDetailsContent(launch) {
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const webcastUrl = safeUrl(launch.webcast);
  const officialUrl = launch.official; // already validated in api.js
  const wikiUrl = safeUrl(launch.wikipedia);
  const favoriteActive = isFavorite(launch.id);

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

    <div class="card-actions details-actions">
      ${favoriteButtonHtml(launch, { variant: "hero" })}
      ${webcastUrl ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Webcast</a>` : ""}
      ${officialUrl ? `<a class="card-link" href="${officialUrl}" target="_blank" rel="noopener">Official page</a>` : ""}
      ${wikiUrl ? `<a class="card-link" href="${wikiUrl}" target="_blank" rel="noopener">Wiki</a>` : ""}
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

export function renderAll() {
  renderHeroMeta();
  renderHero();
  renderOverview();
  renderResults();
  renderDrawer();
  renderOrgControls();
  renderCoverageNote();
  updateCountdownNodes();
  refreshFooterMeta();
}
