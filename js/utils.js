// Pure-ish helpers: HTML/URL safety, date & countdown formatting, and mission
// classification. These are used by the filters and rendering layers.

import { state } from "./state.js";
import { API_URL_HOSTS } from "./config.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Only allow http(s) URLs so untrusted data can never inject javascript:/data:
// schemes into hrefs or image sources.
export function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return "";
}

// Returns a validated, public-facing URL suitable for an "Official page" action,
// or "" if the value is missing or actually points at an API endpoint (e.g. a
// Launch Library REST/object URL). This stops API links from being shown to
// users as if they were mission pages.
export function isPublicMissionUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase();
  if (API_URL_HOSTS.includes(host)) return "";
  if (host.endsWith("thespacedevs.com")) return "";
  if (/^\/\d+\.\d+/.test(parsed.pathname)) return ""; // versioned API path
  if (parsed.pathname.toLowerCase().includes("/api/")) return "";

  return url;
}

// Validate an IANA timezone id by attempting to use it. Returns the id when
// usable, otherwise "". Caches results so repeated formatting stays cheap.
const tzCache = new Map();
export function validTimeZone(tzId) {
  const id = String(tzId || "").trim();
  if (!id) return "";
  if (tzCache.has(id)) return tzCache.get(id);
  let ok = "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: id }).format(0);
    ok = id;
  } catch {
    ok = "";
  }
  tzCache.set(id, ok);
  return ok;
}

// Apply the active time mode to Intl options. In "site" mode we use the launch
// pad timezone when it is valid; otherwise we fall back to local time (the
// details modal labels that fallback honestly).
function applyTimeMode(options, tzId) {
  if (state.dateMode === "utc") {
    options.timeZone = "UTC";
    options.timeZoneName = "short";
  } else if (state.dateMode === "site") {
    const tz = validTimeZone(tzId);
    if (tz) options.timeZone = tz;
    options.timeZoneName = "short"; // show the abbreviation so the zone is clear
  }
  return options;
}

export function formatDate(dateString, tzId) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  const options = applyTimeMode(
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    },
    tzId
  );

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatCompactDate(dateString, tzId) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const options = applyTimeMode(
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    },
    tzId
  );

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function getRelativeLabel(dateString) {
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

export function getCountdownText(dateString) {
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

// Mission/organization classification now lives in organizations.js.
