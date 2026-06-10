// Client-side iCalendar (.ics) generation for a launch. No dependency, no
// backend, no account. The details modal builds a Blob from buildICS() and
// triggers a browser download (see main.js). All timestamps are UTC.

// Escape a value for an ICS text field per RFC 5545 (backslash, comma,
// semicolon, and newlines).
export function escapeICSText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// Format a Date (or date string/number) as an ICS UTC timestamp
// (YYYYMMDDTHHMMSSZ), or null when the input is not a valid date.
export function formatICSDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const t = date.getTime();
  if (!Number.isFinite(t)) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Fold a content line to <=75 octets (approx by char) per RFC 5545, continuing
// with a leading space.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  let first = true;
  while (rest.length > (first ? 75 : 74)) {
    const take = first ? 75 : 74;
    parts.push((first ? "" : " ") + rest.slice(0, take));
    rest = rest.slice(take);
    first = false;
  }
  parts.push((first ? "" : " ") + rest);
  return parts.join("\r\n");
}

// Safe download filename derived from the mission name.
export function icsFilename(launch) {
  const base = String(launch?.name || "mission")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "mission";
  return `${base}.ics`;
}

function osmUrl(launch) {
  const lat = launch?.padLat;
  const lon = launch?.padLon;
  if (typeof lat !== "number" || typeof lon !== "number") return "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  const la = lat.toFixed(5);
  const lo = lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=15/${la}/${lo}`;
}

// Build a VCALENDAR string for a launch, or null when the launch has no valid
// NET timestamp (callers hide/disable the action in that case).
// Default event duration is 2 hours when none is known.
export function buildICS(launch, { now = new Date(), durationMs = 2 * 60 * 60 * 1000 } = {}) {
  const dtStart = formatICSDate(launch?.net);
  if (!dtStart) return null;

  const startMs = new Date(launch.net).getTime();
  const dtEnd = formatICSDate(new Date(startMs + durationMs));
  const dtStamp = formatICSDate(now) || formatICSDate(new Date());
  const uid = `${String(launch?.id || "launch")}@us-space-mission-control`;

  const location = [launch?.padName, launch?.location].filter(Boolean).join(", ");
  const agencyNames = Array.isArray(launch?.agencies)
    ? launch.agencies.map((a) => a?.name).filter(Boolean).join(", ")
    : "";

  const descLines = [];
  if (launch?.rocket) descLines.push(`Rocket: ${launch.rocket}`);
  if (launch?.providerName || launch?.provider) descLines.push(`Provider: ${launch.providerName || launch.provider}`);
  if (agencyNames) descLines.push(`Agencies: ${agencyNames}`);
  if (launch?.official) descLines.push(`Mission page: ${launch.official}`);
  if (launch?.webcast) descLines.push(`Webcast: ${launch.webcast}`);
  const map = osmUrl(launch);
  if (map) descLines.push(`Launch pad map: ${map}`);
  descLines.push("Schedules, statuses, and webcast links can change.");
  const description = descLines.join("\n");

  const urlProp = launch?.official || launch?.webcast || "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//U.S. Space Mission Control//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeICSText(uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICSText(launch?.name || "Launch")}`,
    location ? `LOCATION:${escapeICSText(location)}` : null,
    `DESCRIPTION:${escapeICSText(description)}`,
    urlProp ? `URL:${escapeICSText(urlProp)}` : null,
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean);

  return lines.map(foldLine).join("\r\n");
}
