// Rendering layer: owns the cached DOM references and every function that writes
// markup to the page (hero card, stats, results, favorites, status, countdowns).

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
import { matchesKeyword } from "./filters.js";

// Cached DOM references. Modules run deferred (type="module"), so the document
// is fully parsed before this executes.
export const els = {
  status: document.getElementById("status"),
  keyword: document.getElementById("keyword"),
  missionType: document.getElementById("missionType"),
  sortMode: document.getElementById("sortMode"),
  limit: document.getElementById("limit"),
  dateMode: document.getElementById("dateMode"),
  results: document.getElementById("results"),
  resultsMeta: document.getElementById("resultsMeta"),
  favorites: document.getElementById("favorites"),
  nextLaunchCard: document.getElementById("nextLaunchCard"),
  statsGrid: document.getElementById("statsGrid"),
  heroStats: document.getElementById("heroStats"),
  footerMeta: document.getElementById("footerMeta"),
  btnLoadLatest: document.getElementById("btnLoadLatest"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnUseDemo: document.getElementById("btnUseDemo"),
  btnShowNext: document.getElementById("btnShowNext"),
  btnClearFilters: document.getElementById("btnClearFilters"),
  btnSurprise: document.getElementById("btnSurprise"),
  btnFavoritesOnly: document.getElementById("btnFavoritesOnly"),
  btnRefreshFavorites: document.getElementById("btnRefreshFavorites"),
  btnClearFavorites: document.getElementById("btnClearFavorites")
};

export function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

export function updateInputsFromState() {
  els.keyword.value = state.keyword;
  els.missionType.value = state.missionType;
  els.sortMode.value = state.sortMode;
  els.limit.value = String(state.limit);
  els.dateMode.value = state.dateMode;
  els.btnFavoritesOnly.classList.toggle("is-active", state.favoritesOnly);
  els.btnFavoritesOnly.setAttribute("aria-pressed", String(state.favoritesOnly));
}

export function setLoadingState() {
  els.results.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 4; i += 1) {
    const card = document.createElement("article");
    card.className = "empty-state";
    card.innerHTML = `
      <div class="placeholder-card" aria-hidden="true">
        <div class="placeholder-line placeholder-line-lg"></div>
        <div class="placeholder-line"></div>
        <div class="placeholder-line"></div>
        <div class="placeholder-pills">
          <span class="placeholder-pill"></span>
          <span class="placeholder-pill"></span>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  }

  els.results.appendChild(fragment);
  els.resultsMeta.textContent = "Loading launch schedule...";
}

function buildMetaCard(label, value) {
  return `
    <div class="meta-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Unknown")}</strong>
    </div>
  `;
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
  const probabilityLabel =
    launch.probability === null ? "No forecast yet" : `${launch.probability}% confidence`;
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const webcastUrl = safeUrl(launch.webcast);
  const articleUrl = safeUrl(launch.article);

  els.nextLaunchCard.innerHTML = `
    <div class="next-launch-inner">
      <div class="next-launch-top">
        <div>
          <div class="badge-row">
            <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
            <span class="badge">${escapeHtml(launch.statusName)}</span>
            <span class="badge">${escapeHtml(launch.provider)}</span>
          </div>
          <h2 class="next-launch-title">${escapeHtml(launch.name)}</h2>
          <p class="next-launch-subtitle">
            ${escapeHtml(launch.details ? launch.details.slice(0, 210) : "No mission description has been provided yet.")}
          </p>
        </div>

        <div class="countdown-ring">
          <strong data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</strong>
          <span>Countdown</span>
        </div>
      </div>

      <div class="meta-grid">
        ${buildMetaCard("Launch time", formatDate(launch.net))}
        ${buildMetaCard("Relative", getRelativeLabel(launch.net))}
        ${buildMetaCard("Rocket", launch.rocket || "Unknown rocket")}
        ${buildMetaCard("Pad / location", locationLabel)}
        ${buildMetaCard("Forecast", probabilityLabel)}
        ${buildMetaCard("Favorite", isFavorite(launch.id) ? "Saved" : "Not saved")}
      </div>

      <div class="card-actions">
        <button class="favorite-btn ${isFavorite(launch.id) ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button">
          ${isFavorite(launch.id) ? "Remove favorite" : "Save favorite"}
        </button>
        ${webcastUrl ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Watch webcast</a>` : ""}
        ${articleUrl ? `<a class="card-link" href="${articleUrl}" target="_blank" rel="noopener">Mission page</a>` : ""}
      </div>
    </div>
  `;
}

export function renderHeroStats() {
  const items = [
    { label: "Loaded", value: state.launches.length },
    { label: "Favorites", value: state.favorites.length },
    { label: "Source", value: state.usingDemo ? "Demo" : state.dataSource === "live" ? "Live" : state.dataSource === "cache" ? "Cache" : "—" }
  ];

  els.heroStats.innerHTML = items
    .map(
      (item) => `
        <div class="stat-pill">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `
    )
    .join("");
}

export function renderStats() {
  const counts = {
    total: state.launches.length,
    starlink: state.launches.filter((launch) => classifyMission(launch) === "starlink").length,
    crew: state.launches.filter((launch) => classifyMission(launch) === "crew").length,
    starship: state.launches.filter((launch) => classifyMission(launch) === "starship").length,
    favorites: state.favorites.length
  };

  const cards = [
    { label: "Total launches", value: counts.total, detail: state.usingDemo ? "Demo dataset" : "Upcoming manifest" },
    { label: "Starlink", value: counts.starlink, detail: "Broadband missions" },
    { label: "Crew", value: counts.crew, detail: "Dragon / human flights" },
    { label: "Starship", value: counts.starship, detail: "Big rocket energy" },
    { label: "Favorites", value: counts.favorites, detail: "Saved locally" }
  ];

  els.statsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="quick-stat">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.detail)}</span>
        </article>
      `
    )
    .join("");
}

function buildLaunchCard(launch) {
  const missionClass = classifyMission(launch);
  const locationLabel = [launch.padName, launch.location].filter(Boolean).join(" • ");
  const probabilityLabel =
    launch.probability === null ? "Not posted" : `${launch.probability}%`;
  const articleUrl = safeUrl(launch.article);
  const webcastUrl = safeUrl(launch.webcast);
  const wikiUrl = safeUrl(launch.wikipedia);
  const imageUrl = safeUrl(launch.image);

  const articleLink = articleUrl
    ? `<a class="card-link" href="${articleUrl}" target="_blank" rel="noopener">Mission page</a>`
    : "";

  const webcastLink = webcastUrl
    ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Webcast</a>`
    : "";

  const wikiLink = wikiUrl
    ? `<a class="card-link" href="${wikiUrl}" target="_blank" rel="noopener">Wiki</a>`
    : "";

  const favoriteActive = isFavorite(launch.id);

  return `
    <article class="launch-card" data-launch-id="${escapeHtml(launch.id)}">
      <div class="launch-card-media">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${escapeHtml(launch.name)}" loading="lazy" />`
            : `<div class="empty-state" style="min-height:100%; border:none; border-radius:0;">No image available</div>`
        }
      </div>

      <div class="launch-card-body">
        <div class="badge-row">
          <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
          <span class="badge">${escapeHtml(launch.statusName)}</span>
          <span class="badge">${escapeHtml(launch.provider)}</span>
        </div>

        <h3>${escapeHtml(launch.name)}</h3>
        <div class="card-meta">
          ${escapeHtml(formatDate(launch.net))} • <span data-countdown="${escapeHtml(launch.net)}">${escapeHtml(getCountdownText(launch.net))}</span>
        </div>

        <p class="card-description">
          ${escapeHtml(launch.details || "No mission description is available yet, but the launch card still keeps the important metadata easy to scan.")}
        </p>

        <div class="card-detail-grid">
          <div class="card-detail">
            <span class="card-detail-label">Rocket</span>
            <strong>${escapeHtml(launch.rocket || "Unknown rocket")}</strong>
          </div>
          <div class="card-detail">
            <span class="card-detail-label">Forecast</span>
            <strong>${escapeHtml(probabilityLabel)}</strong>
          </div>
          <div class="card-detail">
            <span class="card-detail-label">Pad / location</span>
            <strong>${escapeHtml(locationLabel || "TBA")}</strong>
          </div>
          <div class="card-detail">
            <span class="card-detail-label">Relative</span>
            <strong>${escapeHtml(getRelativeLabel(launch.net))}</strong>
          </div>
        </div>

        <div class="card-actions">
          <button class="favorite-btn ${favoriteActive ? "is-active" : ""}" data-favorite-id="${escapeHtml(launch.id)}" type="button">
            ${favoriteActive ? "Remove favorite" : "Save favorite"}
          </button>
          ${webcastLink}
          ${articleLink}
          ${wikiLink}
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
        <span>Hit "Load latest launches" to bring the tracker to life.</span>
      </div>
    `;
    els.resultsMeta.textContent = "Nothing loaded yet.";
    return;
  }

  if (state.filteredLaunches.length === 0) {
    els.results.innerHTML = `
      <div class="empty-state">
        <strong>No launches match the current filters</strong>
        <span>Try resetting filters or turning off favorites-only mode.</span>
      </div>
    `;
    els.resultsMeta.textContent = "0 matches";
    return;
  }

  els.results.innerHTML = state.filteredLaunches.map(buildLaunchCard).join("");

  const totalMatches = state.launches
    .filter((launch) => matchesKeyword(launch, state.keyword))
    .filter((launch) => (state.missionType === "all" ? true : classifyMission(launch) === state.missionType))
    .filter((launch) => (state.favoritesOnly ? isFavorite(launch.id) : true)).length;

  els.resultsMeta.textContent = `Showing ${state.filteredLaunches.length} of ${totalMatches} matching launches`;
}

export function renderFavorites() {
  if (state.favorites.length === 0) {
    els.favorites.innerHTML = `
      <div class="empty-state">
        <strong>No favorites yet</strong>
        <span>Save launches here so your personal shortlist survives refreshes.</span>
      </div>
    `;
    return;
  }

  els.favorites.innerHTML = state.favorites
    .map((launch) => {
      const missionClass = classifyMission(launch);
      const webcastUrl = safeUrl(launch.webcast);
      return `
        <article class="favorite-card">
          <div class="badge-row">
            <span class="badge ${toneFromMissionType(missionClass)}">${escapeHtml(missionClass)}</span>
            <span class="badge">${escapeHtml(formatCompactDate(launch.net))}</span>
          </div>
          <h3>${escapeHtml(launch.name)}</h3>
          <p>${escapeHtml(launch.location || launch.padName || "Location pending")} • ${escapeHtml(getRelativeLabel(launch.net))}</p>
          <div class="card-actions">
            <button class="favorite-btn is-active" data-favorite-id="${escapeHtml(launch.id)}" type="button">Remove</button>
            ${webcastUrl ? `<a class="card-link" href="${webcastUrl}" target="_blank" rel="noopener">Webcast</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

export function updateCountdownNodes() {
  document.querySelectorAll("[data-countdown]").forEach((node) => {
    const iso = node.getAttribute("data-countdown");
    node.textContent = getCountdownText(iso);
  });
}

export function refreshFooterMeta() {
  const pieces = [];
  pieces.push(state.usingDemo ? "Demo mode" : `Source: ${state.dataSource || "unknown"}`);
  pieces.push(`Time mode: ${state.dateMode.toUpperCase()}`);
  pieces.push(`Updated: ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`);
  els.footerMeta.textContent = pieces.join(" • ");
}

export function renderAll() {
  renderHero();
  renderHeroStats();
  renderStats();
  renderResults();
  renderFavorites();
  updateCountdownNodes();
  refreshFooterMeta();
}
