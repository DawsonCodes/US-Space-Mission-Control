// Tests for js/calendar.js (.ics generation). Runnable in Node.

import assert from "node:assert/strict";
import { buildICS, escapeICSText, formatICSDate, icsFilename } from "../js/calendar.js";

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const launch = {
  id: "ll-abc-123",
  name: "Vulcan VC4 | NASA Science, Orbiter; Test",
  net: "2026-08-01T12:30:00Z",
  rocket: "Vulcan VC4",
  providerName: "United Launch Alliance",
  agencies: [{ id: 44, name: "NASA" }],
  official: "https://www.nasa.gov/",
  webcast: "https://www.youtube.com/@ulalaunch",
  padName: "SLC-41",
  location: "Cape Canaveral SFS, FL, USA",
  padLat: 28.5833,
  padLon: -80.5827
};

check("ICS text escaping handles comma, semicolon, backslash, newline", () => {
  assert.equal(escapeICSText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

check("formatICSDate produces a UTC stamp", () => {
  assert.equal(formatICSDate("2026-08-01T12:30:00Z"), "20260801T123000Z");
});

check("formatICSDate returns null for invalid dates", () => {
  assert.equal(formatICSDate("not-a-date"), null);
  assert.equal(formatICSDate(undefined), null);
});

check("buildICS returns a VCALENDAR with stable UID and UTC times", () => {
  const ics = buildICS(launch, { now: new Date("2026-07-01T00:00:00Z") });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.ok(ics.includes("UID:ll-abc-123@us-space-mission-control"));
  assert.ok(ics.includes("DTSTART:20260801T123000Z"));
  // Default 2h duration.
  assert.ok(ics.includes("DTEND:20260801T143000Z"));
});

check("buildICS includes provider, rocket, agencies, links, map, disclaimer", () => {
  // Unfold RFC 5545 line folding (CRLF + space) before checking long content,
  // exactly as a calendar client would.
  const ics = buildICS(launch).replace(/\r\n /g, "");
  assert.ok(ics.includes("Vulcan VC4"));
  assert.ok(ics.includes("United Launch Alliance"));
  assert.ok(ics.includes("NASA"));
  assert.ok(ics.includes("https://www.nasa.gov/"));
  assert.ok(ics.includes("https://www.youtube.com/@ulalaunch"));
  assert.ok(ics.includes("openstreetmap.org"));
  assert.ok(/schedules.*change/i.test(ics));
});

check("buildICS escapes the summary (comma/semicolon)", () => {
  const ics = buildICS(launch);
  assert.ok(ics.includes("SUMMARY:Vulcan VC4 | NASA Science\\, Orbiter\\; Test"));
});

check("buildICS returns null when the NET is invalid (action hidden)", () => {
  assert.equal(buildICS({ id: "x", name: "Bad", net: "nope" }), null);
});

check("buildICS uses CRLF line endings", () => {
  const ics = buildICS(launch);
  assert.ok(ics.includes("\r\n"), "CRLF present");
});

check("icsFilename is a safe slug", () => {
  assert.equal(icsFilename(launch), "vulcan-vc4-nasa-science-orbiter-test.ics");
  assert.equal(icsFilename({ name: "" }), "mission.ics");
});

if (failures > 0) { console.error(`\n${failures} calendar test(s) failed.`); process.exit(1); }
console.log("\nAll calendar tests passed.");
