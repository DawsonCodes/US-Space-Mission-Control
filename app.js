const API_UPCOMING =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?lsp__name=SpaceX&limit=100&mode=detailed&ordering=net&hide_recent_previous=true";

const STORAGE_KEYS = {
  favorites: "spacex-mission-control-favorites",
  prefs: "spacex-mission-control-prefs",
  cache: "spacex-mission-control-cache-v2"
};

const CACHE_TTL_MS = 1000 * 60 * 5;

const demoLaunches = [
  {
    id: "demo-starlink-1",
    name: "Falcon 9 Block 5 | Starlink 12-2",
    net: "2026-03-21T00:18:00Z",
    missionName: "Starlink Group 12-2",
    missionType: "Communications",
    details:
      "Demo mission so the tracker still feels alive even when the live API has a bad day.",
    statusName: "Go for Launch",
    probability: 80,
    provider: "SpaceX",
    rocket: "Falcon 9 Block 5",
    padName: "Space Launch Complex 40",
    location: "Cape Canaveral, Florida, USA",
    image: "",
    imageCredit: "",
    webcast: "https://www.youtube.com/@SpaceX",
    article: "https://www.spacex.com/launches/",
    wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Starlink",
    upcoming: true
  },
  {
    id: "demo-crew-1",
    name: "Falcon 9 Block 5 | Crew Dragon Demo",
    net: "2026-04-04T16:35:00Z",
    missionName: "Crew Rotation Demo",
    missionType: "Human Exploration",
    details:
      "Crew-style demo mission with enough metadata to test badges, favorites, and countdown cards.",
    statusName: "To Be Determined",
    probability: 65,
    provider: "SpaceX",
    rocket: "Falcon 9 Block 5",
    padName: "Launch Complex 39A",
    location: "Kennedy Space Center, Florida, USA",
    image: "",
    imageCredit: "",
    webcast: "https://www.youtube.com/@SpaceX",
    article: "https://www.spacex.com/humanspaceflight/",
    wikipedia: "https://en.wikipedia.org/wiki/Crew_Dragon",
    upcoming: true
  },
  {
    id: "demo-starship-1",
    name: "Starship | Integrated Flight Test Demo",
    net: "2026-05-12T13:10:00Z",
    missionName: "Starship Demo",
    missionType: "Test Flight",
    details:
      "A Starship-flavored demo mission so your filtering and sorting can flex every category.",
    statusName: "Watch for Update",
    probability: null,
    provider: "SpaceX",
    rocket: "Starship",
    padName: "Orbital Launch Pad A",
    location: "Starbase, Texas, USA",
    image: "",
    imageCredit: "",
    webcast: "https://www.youtube.com/@SpaceX",
    article: "https://www.spacex.com/vehicles/starship/",
    wikipedia: "https://en.wikipedia.org/wiki/SpaceX_Starship",
    upcoming: true
  }
];

const state = {
  launches: [],
  filteredLaunches: [],
  favorites: [],
  nextLaunch: null,
  usingDemo: false,
  dataSource: "none",
  dateMode: "local",
  missionType: "all",
  sortMode: "soonest",
  limit: 12,
  keyword: "",
  favoritesOnly: false,
  activeRequest: null,
  countdownTimer: null
};

const els = {
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

function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "";
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.prefs);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    state.dateMode = parsed.dateMode || state.dateMode;
    state.missionType = parsed.missionType || state.missionType;
    state.sortMode = parsed.sortMode || state.sortMode;
    state.limit = Number(parsed.limit) || state.limit;
    state.keyword = typeof parsed.keyword === "string" ? parsed.keyword : state.keyword;
    state.favoritesOnly = Boolean(parsed.favoritesOnly);
  } catch {
    // ignore bad local storage
  }
}

function savePreferences() {
  const prefs = {
    dateMode: state.dateMode,
    missionType: state.missionType,
    sortMode: state.sortMode,
    limit: state.limit,
    keyword: state.keyword,
    favoritesOnly: state.favoritesOnly
  };

  localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    const parsed = raw ? JSON.parse(raw) : [];
    state.favorites = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.favorites = [];
  }
}

function saveFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
}

function isFavorite(id) {
  return state.favorites.some((launch) => launch.id === id);
}

function addFavorite(launch) {
  if (!launch || !launch.id || isFavorite(launch.id)) return;
  state.favorites.unshift(launch);
  saveFavorites();
  renderFavorites();
  renderStats();
  renderResults();
  renderHeroStats();
  setStatus(`Saved "${launch.name}" to favorites.`, "success");
}

function removeFavorite(id) {
  const before = state.favorites.length;
  state.favorites = state.favorites.filter((launch) => launch.id !== id);
  if (state.favorites.length === before) return;
  saveFavorites();
  renderFavorites();
  renderStats();
  renderResults();
  renderHeroStats();
  if (state.favoritesOnly) {
    applyFilters();
    renderResults();
  }
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
  setStatus("All favorites cleared.", "warning");
}

function updateInputsFromState() {
  els.keyword.value = state.keyword;
  els.missionType.value = state.missionType;
  els.sortMode.value = state.sortMode;
  els.limit.value = String(state.limit);
  els.dateMode.value = state.dateMode;
  els.btnFavoritesOnly.classList.toggle("is-active", state.favoritesOnly);
  els.btnFavoritesOnly.setAttribute("aria-pressed", String(state.favoritesOnly));
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  const options = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  };

  if (state.dateMode === "utc") {
    options.timeZone = "UTC";
    options.timeZoneName = "short";
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatCompactDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const options = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  if (state.dateMode === "utc") {
    options.timeZone = "UTC";
    options.timeZoneName = "short";
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function getRelativeLabel(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minute = 1000 * 60;
  const hour = minute * 60;
  const day = hour * 24;

  if (absMs < minute) return diffMs >= 0 ? "Launching now" : "Just launched";

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}

function getCountdownText(dateString) {
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return "Unknown";

  let diff = target.getTime() - Date.now();
  if (diff <= 0) return "Live / passed";

  const dayMs = 1000 * 60 * 60 * 24;
  const hourMs = 1000 * 60 * 60;
  const minuteMs = 1000 * 60;

  const days = Math.floor(diff / dayMs);
  diff -= days * dayMs;

  const hours = Math.floor(diff / hourMs);
  diff -= hours * hourMs;

  const minutes = Math.floor(diff / minuteMs);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function classifyMission(launch) {
  const haystack = [
    launch.name,
    launch.missionName,
    launch.details,
    launch.rocket,
    launch.missionType
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("starlink")) return "starlink";
  if (haystack.includes("crew") || haystack.includes("dragon")) return "crew";
  if (haystack.includes("cargo") || haystack.includes("crs")) return "cargo";
  if (haystack.includes("starship")) return "starship";
  if (haystack.includes("transporter")) return "transporter";
  if (haystack.includes("rideshare")) return "rideshare";
  if (haystack.includes("science") || haystack.includes("lunar") || haystack.includes("planetary")) return "science";
  return "other";
}

function toneFromMissionType(type) {
  return `type-${type}`;
}

function simplifyLaunch(raw) {
  const imageUrl =
    raw?.image?.image_url ||
    raw?.image_url ||
    raw?.image ||
    raw?.mission_patches?.[0]?.image_url ||
    "";

  const missionName = raw?.mission?.name || "";
  const missionType = raw?.mission?.type || "";

  return {
    id: raw?.id || crypto.randomUUID?.() || `launch-${Math.random().toString(36).slice(2)}`,
    name: raw?.name || missionName || "Unknown mission",
    net: raw?.net || raw?.date_utc || "",
    missionName,
    missionType,
    details: raw?.mission?.description || raw?.details || "",
    statusName: raw?.status?.name || (raw?.upcoming ? "Upcoming" : "Completed"),
    probability: typeof raw?.probability === "number" ? raw.probability : null,
    provider: raw?.launch_service_provider?.name || "SpaceX",
    rocket: raw?.rocket?.configuration?.full_name || raw?.rocket?.configuration?.name || "",
    padName: raw?.pad?.name || "",
    location: raw?.pad?.location?.name || "",
    image: imageUrl,
    imageCredit: raw?.image?.credit || "",
    webcast:
      raw?.video_url ||
      raw?.vid_urls?.[0] ||
      raw?.links?.webcast ||
      "",
    article:
      raw?.url ||
      raw?.info_url ||
      raw?.info_urls?.[0] ||
      raw?.links?.article ||
      "",
    wikipedia:
      raw?.pad?.wiki_url ||
      raw?.wiki_url ||
      raw?.links?.wikipedia ||
      "",
    upcoming: true
  };
}

function getLaunchCache() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const age = Date.now() - Number(parsed.savedAt || 0);
    if (age > CACHE_TTL_MS) return null;

    if (!Array.isArray(parsed.results)) return null;
    return parsed.results;
  } catch {
    return null;
  }
}

function saveLaunchCache(results) {
  const payload = {
    savedAt: Date.now(),
    results
  };

  sessionStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(payload));
}

function setLoadingState() {
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

async function fetchLiveLaunches(forceRefresh = false) {
  if (state.activeRequest) {
    state.activeRequest.abort();
  }

  if (!forceRefresh) {
    const cached = getLaunchCache();
    if (cached) {
      state.dataSource = "cache";
      return cached;
    }
  }

  const controller = new AbortController();
  state.activeRequest = controller;

  const response = await fetch(API_UPCOMING, {
    method: "GET",
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Launch API returned ${response.status}`);
  }

  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  saveLaunchCache(results);
  state.dataSource = "live";
  return results;
}

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
  state.launches = demoLaunches.map((launch) => ({ ...launch }));
  state.nextLaunch = state.launches[0] || null;
  state.usingDemo = true;
  state.dataSource = "demo";
  applyFilters();
  renderAll();
  setStatus(`Demo mode active with ${state.launches.length} missions.`, "warning");
}

function matchesKeyword(launch, keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    launch.name,
    launch.missionName,
    launch.details,
    launch.location,
    launch.padName,
    launch.rocket,
    launch.statusName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function compareLaunches(a, b) {
  switch (state.sortMode) {
    case "latest":
      return new Date(b.net) - new Date(a.net);
    case "name":
      return a.name.localeCompare(b.name);
    case "probability":
      return (b.probability ?? -1) - (a.probability ?? -1);
    case "soonest":
    default:
      return new Date(a.net) - new Date(b.net);
  }
}

function applyFilters() {
  const filtered = state.launches
    .filter((launch) => matchesKeyword(launch, state.keyword))
    .filter((launch) => (state.missionType === "all" ? true : classifyMission(launch) === state.missionType))
    .filter((launch) => (state.favoritesOnly ? isFavorite(launch.id) : true))
    .sort(compareLaunches);

  state.filteredLaunches = filtered.slice(0, state.limit);
  savePreferences();
}

function buildMetaCard(label, value) {
  return `
    <div class="meta-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Unknown")}</strong>
    </div>
  `;
}

function renderHero() {
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

function renderHeroStats() {
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

function renderStats() {
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

function renderResults() {
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

function renderFavorites() {
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

function updateCountdownNodes() {
  document.querySelectorAll("[data-countdown]").forEach((node) => {
    const iso = node.getAttribute("data-countdown");
    node.textContent = getCountdownText(iso);
  });
}

function refreshFooterMeta() {
  const pieces = [];
  pieces.push(state.usingDemo ? "Demo mode" : `Source: ${state.dataSource || "unknown"}`);
  pieces.push(`Time mode: ${state.dateMode.toUpperCase()}`);
  pieces.push(`Updated: ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date())}`);
  els.footerMeta.textContent = pieces.join(" • ");
}

function renderAll() {
  renderHero();
  renderHeroStats();
  renderStats();
  renderResults();
  renderFavorites();
  updateCountdownNodes();
  refreshFooterMeta();
}

function resetFilters() {
  state.keyword = "";
  state.missionType = "all";
  state.sortMode = "soonest";
  state.limit = 12;
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

function startCountdownTicker() {
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
  }

  state.countdownTimer = window.setInterval(() => {
    updateCountdownNodes();
    refreshFooterMeta();
  }, 1000);
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
    state.limit = Number(event.target.value) || 12;
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

function setupStarfield() {
  const canvas = document.getElementById("starfield");
  const context = canvas.getContext("2d");
  if (!context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stars = [];
  const shootingStars = [];

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let pointerX = 0;
  let pointerY = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    stars.length = 0;
    const density = Math.max(80, Math.floor((width * height) / 14000));

    for (let i = 0; i < density; i += 1) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.6 + 0.25,
        alpha: Math.random() * 0.6 + 0.15,
        twinkleSpeed: Math.random() * 0.016 + 0.004,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.9 + 0.1
      });
    }
  }

  function spawnShootingStar() {
    shootingStars.push({
      x: Math.random() * width * 0.8,
      y: Math.random() * height * 0.35,
      vx: Math.random() * 500 + 900,
      vy: Math.random() * 180 + 160,
      life: 0,
      maxLife: Math.random() * 0.6 + 0.5
    });
  }

  function drawFrame() {
    context.clearRect(0, 0, width, height);

    const glow = context.createRadialGradient(
      width * 0.2 + pointerX * 18,
      height * 0.2 + pointerY * 12,
      20,
      width * 0.2 + pointerX * 18,
      height * 0.2 + pointerY * 12,
      Math.max(width, height) * 0.75
    );
    glow.addColorStop(0, "rgba(115, 182, 255, 0.12)");
    glow.addColorStop(0.45, "rgba(157, 125, 255, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    for (const star of stars) {
      star.phase += reducedMotion ? 0 : star.twinkleSpeed;
      const twinkle = (Math.sin(star.phase) + 1) * 0.5;
      context.beginPath();
      context.fillStyle = `rgba(255,255,255,${star.alpha * (0.55 + twinkle * 0.45)})`;
      context.arc(star.x + pointerX * star.depth * 10, star.y + pointerY * star.depth * 8, star.radius, 0, Math.PI * 2);
      context.fill();
    }

    if (!reducedMotion && shootingStars.length < 2 && Math.random() < 0.015) {
      spawnShootingStar();
    }

    for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
      const star = shootingStars[i];
      star.life += 0.016;
      star.x += star.vx * 0.016;
      star.y += star.vy * 0.016;

      const progress = star.life / star.maxLife;
      const alpha = 1 - progress;

      context.strokeStyle = `rgba(255,255,255,${alpha * 0.7})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(star.x, star.y);
      context.lineTo(star.x - 140, star.y - 36);
      context.stroke();

      if (progress >= 1 || star.x > width + 160 || star.y > height + 120) {
        shootingStars.splice(i, 1);
      }
    }

    window.requestAnimationFrame(drawFrame);
  }

  window.addEventListener("pointermove", (event) => {
    pointerX = (event.clientX / width - 0.5) * 2;
    pointerY = (event.clientY / height - 0.5) * 2;
  });

  window.addEventListener("resize", resize);
  resize();
  window.requestAnimationFrame(drawFrame);
}

function init() {
  loadPreferences();
  loadFavorites();
  updateInputsFromState();
  applyFilters();
  renderAll();
  attachEventListeners();
  startCountdownTicker();
  setupStarfield();
  loadLaunches(false);
}

init();