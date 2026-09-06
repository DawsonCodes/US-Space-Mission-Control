// Regressions for the confirmed findings of the v3.8.0 audit. Every one of
// these was live on the site with the full suite green, so each check here
// exists because nothing else was watching that behaviour.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function makeEl() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    focus() {}, scrollIntoView() {}, getContext: () => null, get offsetWidth() { return 0; }
  };
}
const nodes = new Map();
globalThis.document = {
  getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeEl()); return nodes.get(id); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};

// A localStorage that refuses every write, which is what a browser with site
// data blocked, or a full origin quota, actually gives you.
let refuseWrites = false;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { if (refuseWrites) throw new DOMException("quota", "QuotaExceededError"); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, setInterval: () => 0, clearInterval() {} };

const { safeUrl } = await import("../js/utils.js");
const { buildDetailsContent } = await import("../js/render.js");
const orgs = await import("../js/organizations.js");
const { savePreferences, saveFavorites } = await import("../js/storage.js");

const html = readFileSync("index.html", "utf8");
const published = JSON.parse(readFileSync("data/launches.json", "utf8")).launches;

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- URLs cannot break out of an attribute ---------------------------
const HOSTILE = 'https://x.example/v" onmouseover="alert(1)" x="';

check("safeUrl normalizes rather than handing back the raw string", () => {
  // The scheme check passed everything after it through verbatim, so a quote in
  // a Launch Library URL closed the href or src it was written into.
  const out = safeUrl(HOSTILE);
  assert.ok(out.startsWith("https://x.example/"), out);
  assert.ok(!out.includes('"'), `a raw quote survived: ${out}`);
});

check("safeUrl still rejects a non-http scheme and passes an ordinary URL", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("  "), "");
  assert.equal(safeUrl(null), "");
  assert.equal(safeUrl("https://example.test/a/b?c=1"), "https://example.test/a/b?c=1");
});

check("a hostile URL injects no event handler into the details view", () => {
  const out = buildDetailsContent({
    id: "x1", name: "Test Mission", net: "2026-12-01T00:00:00Z",
    statusName: "Go for Launch", statusId: 1, providerName: "SpaceX", providerId: 121,
    agencies: [], rocket: "Falcon 9", padName: "Pad", location: "Cape Canaveral, FL, USA",
    missionImage: HOSTILE, webcast: HOSTILE, official: HOSTILE, wikipedia: HOSTILE,
    padLat: 28.5, padLon: -80.5, orbitName: "LEO", missionName: "Test"
  });
  assert.ok(!/"\s+on\w+\s*=/.test(out), "a URL closed its attribute and injected a handler");
  // The decisive check: no tag may carry an on* attribute. Searching the raw
  // string for "onmouseover" is not it, because the encoded URL legitimately
  // still contains those characters inside the attribute VALUE, where they are
  // inert text rather than a handler.
  for (const tag of out.match(/<[a-z][^>]*>/gi) || []) {
    // Blank out quoted values first. An escaped value may legitimately contain
    // the characters of a handler as inert text; only a name sitting outside
    // the quotes is an actual attribute.
    const bare = tag.replace(/="[^"]*"/g, '=""');
    const attrNames = [...bare.matchAll(/[\s]([a-zA-Z-]+)\s*=/g)].map((m) => m[1].toLowerCase());
    const handlers = attrNames.filter((n) => n.startsWith("on"));
    assert.equal(handlers.length, 0, `event handler ${handlers[0]} injected into: ${tag.slice(0, 120)}`);
  }
});

check("every URL sink in render.js is escaped", () => {
  const src = readFileSync("js/render.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const sinks = src.match(/(?:href|src)="\$\{[^}]*\}"/g) || [];
  for (const sink of sinks) {
    assert.ok(/escapeHtml\(/.test(sink), `unescaped URL sink: ${sink}`);
  }
  assert.ok(sinks.length >= 8, `expected the known sinks, found ${sinks.length}`);
});

// ---------- the hero is not announced every second --------------------------
check("the featured mission spotlight is not an aria-live region", () => {
  // Its countdown carries a screen-reader copy rewritten every second, so a
  // polite region here queued one announcement per second and never drained.
  const tag = /<section[^>]*id="nextLaunchCard"[^>]*>/.exec(html);
  assert.ok(tag, "#nextLaunchCard not found");
  assert.ok(!/aria-live/.test(tag[0]), "the hero is a live region again");
  assert.ok(/aria-label=/.test(tag[0]), "it should still be a named region");
});

// ---------- storage refusing writes must not kill the page ------------------
check("preferences and favorites survive a browser that refuses writes", () => {
  refuseWrites = true;
  try {
    assert.doesNotThrow(() => savePreferences(), "savePreferences threw out of init()");
    assert.doesNotThrow(() => saveFavorites(), "saveFavorites threw");
  } finally {
    refuseWrites = false;
  }
});

// ---------- classification, checked against the real published manifest -----
check("HASTE is suborbital, so the Suborbital filter matches something", () => {
  // Rocket Lab flies HASTE on Electron. Matching the rocket alone called all
  // three published HASTE flights orbital, and left the Suborbital filter
  // matching nothing at all in a 224-launch manifest.
  const haste = published.filter((l) => /\bhaste\b/i.test(l.name || ""));
  assert.ok(haste.length > 0, "no HASTE flights in the published data to check");
  for (const l of haste) assert.equal(orgs.flightType(l), "suborbital", l.name);

  const suborbital = published.filter((l) => orgs.flightType(l) === "suborbital");
  assert.ok(suborbital.length > 0, "the Suborbital filter still matches nothing");
});

check("New Shepard is still suborbital and orbital vehicles are unaffected", () => {
  assert.equal(orgs.flightType({ rocket: "New Shepard" }), "suborbital");
  assert.equal(orgs.flightType({ rocket: "Falcon 9 Block 5" }), "orbital");
  assert.equal(orgs.flightType({ rocket: "Electron", name: "Electron | Starlink rideshare" }), "orbital");
  assert.equal(orgs.flightType({ rocket: "Something Else" }), "unknown");
});

check("an orbit LL2 reports as Unknown or N/A counts as absent, not as a name", () => {
  // These arrive as literal text rather than an empty field, so they read as a
  // named orbit and were bucketed "other", unreachable from every orbit filter.
  for (const [name, abbrev] of [["Unknown", "N/A"], ["unknown", ""], ["", "TBD"], ["N/A", "N/A"]]) {
    assert.equal(orgs.orbitCategory({ orbitName: name, orbitAbbrev: abbrev }), "unknown", `${name}/${abbrev}`);
  }
  assert.equal(orgs.orbitCategory({ orbitName: "Low Earth Orbit", orbitAbbrev: "LEO" }), "leo");
  assert.equal(orgs.orbitCategory({ orbitName: "Sun-Synchronous Orbit", orbitAbbrev: "SSO" }), "sso");
});

check("the published launches with a sentinel orbit reach the Unknown orbit filter", () => {
  const sentinel = published.filter((l) => /^(unknown|n\/a)$/i.test(String(l.orbitName || "").trim()));
  assert.ok(sentinel.length > 0, "no sentinel orbits in the published data to check");
  for (const l of sentinel) {
    assert.equal(orgs.orbitCategory(l), "unknown", `${l.name} is still bucketed elsewhere`);
  }
});

check("LL2's own mission type outranks prose in the description", () => {
  // USSF-153 is Government/Top Secret, and its description mentions Starlink.
  // Reading the prose first badged it a Starlink flight and dropped it out of
  // the National security filter.
  const ussf = published.filter((l) => /ussf|nrol/i.test(l.name || ""));
  assert.ok(ussf.length > 0, "no USSF/NROL launches in the published data to check");
  for (const l of ussf) {
    if (!/top secret|security/i.test(l.missionType || "")) continue;
    assert.equal(orgs.classifyMissionType(l), "national-security", l.name);
  }
});

check("a real Starlink flight is still classified Starlink", () => {
  assert.equal(
    orgs.classifyMissionType({ name: "Falcon 9 Block 5 | Starlink Group 15-24", missionType: "Communications" }),
    "starlink"
  );
});

// ---------- placeholder NETs ------------------------------------------------
const { isApproximateNet } = await import("../js/utils.js");
const { buildICS } = await import("../js/calendar.js");
const { matchesDateRange } = await import("../js/filters.js");
const { getWeatherForLaunch } = await import("../js/weather.js");

check("a Launch Library placeholder NET is recognized as approximate", () => {
  // 221 of the 224 published launches sit at a month boundary at midnight UTC
  // with a tentative status. That is "sometime this month", not a launch time.
  const approx = published.filter(isApproximateNet);
  assert.ok(approx.length > 100, `only ${approx.length} of ${published.length} recognized`);
  assert.equal(isApproximateNet({ net: "2026-09-06T10:59:00Z", statusName: "Go for Launch" }), false);
  assert.equal(isApproximateNet({ net: "2026-09-30T00:00:00Z", statusName: "To Be Determined" }), true);
});

check("Launch Library's own precision wins over the shape guess", () => {
  assert.equal(isApproximateNet({ net: "2026-09-30T00:00:00Z", statusName: "To Be Determined", netPrecision: "Day" }), false);
  assert.equal(isApproximateNet({ net: "2026-09-06T10:59:00Z", statusName: "Go for Launch", netPrecision: "Month" }), true);
});

check("a placeholder exports as an all-day marker, not a two-hour appointment", () => {
  // It was writing a fabricated commitment into a real calendar, at a midnight
  // that the data never claimed, on a day local time shifted it off anyway.
  const ics = buildICS({
    id: "x", name: "Starship | Flight 14", net: "2026-09-30T00:00:00Z",
    statusName: "To Be Determined", padName: "Pad", location: "Starbase, TX, USA"
  });
  assert.match(ics, /DTSTART;VALUE=DATE:20260930/, "still a timed event");
  assert.match(ics, /DTEND;VALUE=DATE:20261001/);
  assert.ok(/has not confirmed a date or time/.test(ics), "the entry does not say it is a placeholder");
});

check("a real launch time still exports as a timed event", () => {
  const ics = buildICS({
    id: "y", name: "Falcon 9 | Starlink", net: "2026-09-10T15:37:00Z",
    statusName: "Go for Launch", padName: "Pad", location: "Cape Canaveral, FL, USA"
  });
  assert.match(ics, /DTSTART:20260910T153700Z/);
  assert.ok(!/VALUE=DATE/.test(ics), "a confirmed launch became an all-day marker");
});

check("near-term filters do not admit placeholders as imminent", () => {
  const soon = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const placeholder = {
    net: new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate())).toISOString(),
    statusName: "To Be Determined"
  };
  assert.equal(matchesDateRange(placeholder, "24h"), false, "a placeholder was listed as within 24 hours");
  assert.equal(matchesDateRange(placeholder, "7d"), false);
  const real = { net: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), statusName: "Go for Launch" };
  assert.equal(matchesDateRange(real, "24h"), true, "a genuinely scheduled launch was excluded");
});

// ---------- a launch that has flown has no forecast -------------------------
check("a past launch is not given today's weather as its outlook", async () => {
  const result = await getWeatherForLaunch({
    padLat: 28.5, padLon: -80.5, net: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  });
  assert.equal(result.status, "already-flown", `got ${result.status}`);
});

// ---------- the rest of the sweep -------------------------------------------
check("the refresh-window strip is not an aria-live region", () => {
  const tag = /<div class="refresh-window"[^>]*>/.exec(html);
  assert.ok(tag, "#refreshWindow not found");
  assert.ok(!/aria-live/.test(tag[0]), "it announces itself every 30 seconds again");
});

check("the starfield stops moving under prefers-reduced-motion", () => {
  // Parallax was the one thing not gated, so the whole sky still slid under the
  // pointer for a reader who had asked for no motion.
  const src = readFileSync("js/starfield.js", "utf8");
  const handler = /addEventListener\("pointermove"[\s\S]*?\n  \}\);/.exec(src);
  assert.ok(handler, "pointermove handler not found");
  const guardAt = handler[0].indexOf("if (reducedMotion) return;");
  const writeAt = handler[0].indexOf("pointerX =");
  assert.ok(guardAt > -1, "the handler does not check reduced motion at all");
  assert.ok(guardAt < writeAt, "the guard runs after the parallax is already written");
});

check("the Debug button reports that it is loading", () => {
  const src = readFileSync("js/main.js", "utf8");
  const fn = /function syncDebugToggle\([\s\S]*?\n}/.exec(src)[0];
  assert.match(fn, /busy/, "syncDebugToggle still ignores the flag its caller passes");
  assert.match(fn, /is-busy/, "the documented ANIM-31 class is never applied");
});

check("the footer clock follows the time mode printed beside it", () => {
  const src = readFileSync("js/render.js", "utf8");
  const fn = /function clockFormatter\([\s\S]*?\n}/.exec(src)[0];
  assert.match(fn, /timeZone/, "the clock is always local, even when the mode says UTC");
  assert.match(fn, /mode/, "the formatter is not keyed by mode");
});

check("a dead sort option is not offered", () => {
  const src = readFileSync("js/render.js", "utf8");
  assert.match(src, /syncSortOptions/, "the probability sort is offered whether or not it can sort");
});

check("nothing documents an API fallback that no longer exists", () => {
  // README, config.js and the workflow header all promised the dashboard would
  // call Launch Library when the published file went stale. The age gate was
  // removed, so that safety net was fiction.
  for (const [file, text] of [
    ["README.md", readFileSync("README.md", "utf8")],
    ["js/config.js", readFileSync("js/config.js", "utf8")],
    [".github/workflows/refresh-data.yml", readFileSync(".github/workflows/refresh-data.yml", "utf8")]
  ]) {
    assert.ok(
      !/falls back to calling|fallback to calling/i.test(text),
      `${file} still promises a stale-snapshot API fallback`
    );
  }
});

if (failures > 0) { console.error(`\n${failures} audit-fix check(s) failed.`); process.exit(1); }
console.log("\nAudit-fix checks passed.");
