// Pure-ish helpers: HTML/URL safety, date & countdown formatting, and mission
// classification. These are used by the filters and rendering layers.

import { state } from "./state.js";

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

export function formatDate(dateString) {
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

export function formatCompactDate(dateString) {
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

export function classifyMission(launch) {
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

export function toneFromMissionType(type) {
  return `type-${type}`;
}
