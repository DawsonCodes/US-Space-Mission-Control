// Rendering layer: owns the cached DOM references and every function that writes
// markup to the page (hero spotlight, stats strip, schedule cards, results
// counts, saved drawer, details modal, weather snippets, countdowns). It builds
// overlay *content* but never drives overlay mechanics (that lives in modal.js).

import { state } from "./state.js";
import {
  escapeHtml,
  safeUrl,
  classifyMission,
  toneFromMissionType,
  formatDate,
  formatCompactDate,
  getRelativeLabel,
  getCountdownText
} from "./utils.js";
import { isFavorite } from "./storage.js";
import { hasActiveFilters } from "./filters.js";
import { weatherCodeLabel } from "./weather.js";

export const els = {
  status: document.getElementById("status"),
  keyword: document.getElementById("keyword"),
  missionType: document.getElementById("missionType"),
  sortMode: document.getElementById("sortMode"),
  dateMode: document.getElementById("dateMode"),
  results: document.getElementById("results"),
  resultsMeta: document.getElementById("resultsMeta"),
  statsGrid: document.getElementById("statsGrid"),
  nextLaunchCard: document.getElementById("nextLaunchCard"),
  dataSource: document.getElementById("dataSource"),
  lastUpdated: document.getElementById("lastUpdated"),
  footerMeta: document.getElementById("footerMeta"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnUseDemo: document.getElementById("btnUseDemo"),
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
  detailsContent: document.getElementById("detailsContent")
};

export function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
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

// Enable/disable Reset based on whether any non-default filter is active.
export function updateResetState() {
  els.btnClearFilters.disabled = !hasActiveFilters();
}

export function updateInputsFromState() {
  els.keyword.value = state.keyword;
  els.missionType.value = state.missionType;
  els.sortMode.value = state.sortMode;
  els.dateMode.value = state.dateMode;
  updateResetState();
  renderSavedCount();
}

// Update only the favorite buttons for one mission inside the results grid,
// so toggling a save doesn't re-render (and re-animate) the whole grid.
export function syncGridFavorite(id) {
  const fav = isFavorite(id);
  els.results
    .querySelectorAll(`[data-favorite-id=${JSON.stringify(id)}]`)
    .forEach((btn) => {
      btn.classList.toggle("is-active", fav);
      btn.textContent = fav ? "Saved" : "Save";
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
        <strong>No next launch available</strong>
        <span>Load live data or switch to demo mode.</span>
      </div>
    `;
    return;
  }

  const missionClass = classifyMission(launch);
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const webcastUrl = safeUrl(launch.webcast);

  els.nextLaunchCard.innerHTML = `
    <div class="spotlight-head">
      <span class="eyebrow">Next launch</span>
      <div class="badge-row">
        <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
        <span class="badge">${escapeHtml(launch.statusName)}</span>
      </div>
    </div>

    <div class="spotlight-main">
      <div class="spotlight-copy">
        <h2 class="spotlight-title">${escapeHtml(launch.name)}</h2>
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
      <button class="favorite-btn ${isFavorite(launch.id) ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button">
        ${isFavorite(launch.id) ? "Saved" : "Save mission"}
      </button>
      ${webcastUrl ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Watch webcast</a>` : ""}
    </div>
  `;
}

// ----- Stats strip --------------------------------------------------------

export function renderStats() {
  const count = (type) => state.launches.filter((l) => classifyMission(l) === type).length;
  const items = [
    { label: "Total", value: state.launches.length },
    { label: "Starlink", value: count("starlink") },
    { label: "Crew", value: count("crew") },
    { label: "Starship", value: count("starship") },
    { label: "Saved", value: state.favorites.length }
  ];
  els.statsGrid.innerHTML = items
    .map(
      (item) => `
        <div class="stat-chip">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `
    )
    .join("");
}

// ----- Schedule cards -----------------------------------------------------

function buildLaunchCard(launch, index) {
  const missionClass = classifyMission(launch);
  const imageUrl = safeUrl(launch.image);
  const favoriteActive = isFavorite(launch.id);
  const stagger = Math.min(index, 12);

  return `
    <article class="launch-card" data-launch-id="${escapeHtml(launch.id)}" style="--card-index:${stagger}">
      <div class="launch-card-media">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${escapeHtml(launch.name)}" loading="lazy" />`
            : `<div class="media-fallback">No image available</div>`
        }
        <span class="badge ${toneFromMissionType(missionClass)} badge-float">${escapeHtml(missionClass)}</span>
      </div>

      <div class="launch-card-body">
        <div class="card-status-row">
          <span class="badge">${escapeHtml(launch.statusName)}</span>
          <span class="card-relative">${escapeHtml(getRelativeLabel(launch.net))}</span>
        </div>

        <h3>${escapeHtml(launch.name)}</h3>
        <div class="card-meta">
          ${escapeHtml(formatDate(launch.net))} • <span data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</span>
        </div>

        <dl class="card-facts">
          <div><dt>Rocket</dt><dd>${escapeHtml(launch.rocket || "Unknown rocket")}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(concise(launch))}</dd></div>
        </dl>

        <div class="card-actions">
          <button class="btn btn-small btn-details" data-details-id="${escapeHtml(launch.id)}" type="button">Details</button>
          <button class="favorite-btn btn-small ${favoriteActive ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button">
            ${favoriteActive ? "Saved" : "Save"}
          </button>
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
        <span>Try a different search or reset the filters.</span>
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
      const missionClass = classifyMission(launch);
      return `
        <article class="saved-card">
          <div class="badge-row">
            <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
            <span class="badge">${escapeHtml(formatCompactDate(launch.net))}</span>
          </div>
          <h3>${escapeHtml(launch.name)}</h3>
          <p>${escapeHtml(concise(launch))} • ${escapeHtml(getRelativeLabel(launch.net))}</p>
          <div class="card-actions">
            <button class="btn btn-small btn-details" data-details-id="${escapeHtml(launch.id)}" type="button">Details</button>
            <button class="favorite-btn btn-small is-active" data-favorite-id="${escapeHtml(launch.id)}" type="button">Remove</button>
          </div>
        </article>
      `;
    })
    .join("");
}

// ----- Details modal content ---------------------------------------------

export function buildDetailsContent(launch) {
  const missionClass = classifyMission(launch);
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const webcastUrl = safeUrl(launch.webcast);
  const officialUrl = launch.official; // already validated in api.js
  const wikiUrl = safeUrl(launch.wikipedia);
  const favoriteActive = isFavorite(launch.id);

  const probabilityRow =
    launch.probability === null
      ? ""
      : `<div><dt>Launch probability</dt><dd>${escapeHtml(launch.probability)}%</dd></div>`;

  return `
    <div class="details-head">
      <div class="badge-row">
        <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
        <span class="badge">${escapeHtml(launch.statusName)}</span>
        <span class="badge">${escapeHtml(launch.provider)}</span>
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
      ${probabilityRow}
    </dl>

    <p class="details-description">
      ${escapeHtml(launch.details || "No mission description has been provided yet.")}
    </p>

    <section class="weather-block" data-weather aria-live="polite"></section>

    <div class="card-actions details-actions">
      <button class="favorite-btn ${favoriteActive ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button">
        ${favoriteActive ? "Remove from saved" : "Save mission"}
      </button>
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
  const wrap = (inner, extraNote = false) =>
    `${heading}${inner}${extraNote ? note : ""}`;

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
    const temp = d.temperature === null || d.temperature === undefined
      ? "—"
      : `${Math.round(Number(d.temperature))}${u.temperature_2m || "°"}`;
    const condition = weatherCodeLabel(d.weatherCode);

    if (compact) {
      const precip = d.precipitationProbability === null ? "" : ` • ${fmt(d.precipitationProbability, "%")} precip`;
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

  // invalid-time and error both fall through to the temporary-failure wording.
  return wrap(`<p class="weather-msg">Weather outlook temporarily unavailable.</p>`);
}

// Inject weather HTML into every [data-weather] mount currently in the DOM that
// belongs to the given launch context (hero + open details share the wording).
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
  renderStats();
  renderResults();
  renderDrawer();
  updateCountdownNodes();
  refreshFooterMeta();
}
