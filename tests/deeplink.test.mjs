// Tests for js/deeplink.js (shareable mission links). Runnable in Node.

import assert from "node:assert/strict";
import { buildMissionUrl, parseMissionId, stripMissionParam } from "../js/deeplink.js";

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// GitHub Pages project subpath must be preserved.
const pagesHref = "https://dawsoncodes.github.io/US-Space-Mission-Control/";

check("buildMissionUrl preserves the GitHub Pages project subpath", () => {
  const url = buildMissionUrl(pagesHref, "ll-123");
  assert.equal(url, "https://dawsoncodes.github.io/US-Space-Mission-Control/?mission=ll-123");
});

check("buildMissionUrl encodes ids with special characters", () => {
  const url = buildMissionUrl(pagesHref, "a b/c&d");
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("mission"), "a b/c&d");
  assert.ok(url.includes("mission=a+b%2Fc%26d"));
});

check("buildMissionUrl replaces an existing mission param and drops the hash", () => {
  const url = buildMissionUrl("https://x.dev/app/?mission=old#frag", "new");
  assert.equal(url, "https://x.dev/app/?mission=new");
});

check("parseMissionId reads the id from a query string", () => {
  assert.equal(parseMissionId("?mission=ll-9"), "ll-9");
  assert.equal(parseMissionId("mission=ll-9&x=1"), "ll-9");
});

check("parseMissionId returns null when absent", () => {
  assert.equal(parseMissionId(""), null);
  assert.equal(parseMissionId("?x=1"), null);
});

check("stripMissionParam removes only the mission param, preserving subpath", () => {
  const rel = stripMissionParam("https://dawsoncodes.github.io/US-Space-Mission-Control/?mission=ll-1&x=2");
  assert.equal(rel, "/US-Space-Mission-Control/?x=2");
});

check("stripMissionParam yields a clean path when no other params remain", () => {
  const rel = stripMissionParam("https://dawsoncodes.github.io/US-Space-Mission-Control/?mission=ll-1");
  assert.equal(rel, "/US-Space-Mission-Control/");
});

check("round-trip: build then parse returns the same id", () => {
  const id = "evt-2026-08-01";
  const url = buildMissionUrl(pagesHref, id);
  assert.equal(parseMissionId(new URL(url).search), id);
});

if (failures > 0) { console.error(`\n${failures} deeplink test(s) failed.`); process.exit(1); }
console.log("\nAll deeplink tests passed.");
