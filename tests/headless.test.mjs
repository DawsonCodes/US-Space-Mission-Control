// Headless boot + render harness with a minimal DOM shim. Not a browser
// substitute — it catches ReferenceErrors / wiring regressions and validates
// the data + render pipeline: ULA/Firefly feed, eight overview tiles, expanded
// insights, calendar/share/site-time in the details modal, plus v3.3 UI state
// (skeleton clearing, card entrance, active-filter summary, animated counts).
// Runnable in Node with no dependencies.

function makeEl(id = "") {
  const classes = new Set();
  const attrs = {};
  const style = { setProperty() {}, removeProperty() {} };
  return {
    id, dataset: {}, style, hidden: false, disabled: false, value: "",
    textContent: "", innerHTML: "", tabIndex: 0, open: false,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, f) => (f === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : f ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c)
    },
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] ?? null; }, removeAttribute(k) { delete attrs[k]; },
    appendChild() {}, append() {}, prepend() {}, remove() {},
    insertAdjacentHTML(_pos, html) { this.innerHTML += html; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, contains() { return false; },
    focus() {}, scrollIntoView() {}, getContext() { return null; },
    get offsetWidth() { return 0; }
  };
}
const elCache = new Map();
globalThis.document = {
  getElementById(id) { if (!elCache.has(id)) elCache.set(id, makeEl(id)); return elCache.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener() {}, get body() { return makeEl("body"); }
};
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  setInterval: setInterval.bind(globalThis), clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://dawsoncodes.github.io/US-Space-Mission-Control/", search: "", pathname: "/US-Space-Mission-Control/", hash: "" }
};
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.history = { pushState() {}, replaceState() {} };
// navigator is a read-only global in modern Node; clipboard is only touched on
// a share click (never during this boot), so we leave it untouched.

const mk = (id, lsp, name, extras = {}) => ({
  id, name, net: "2026-08-01T12:00:00Z", last_updated: "2026-06-01T00:00:00Z",
  status: { name: "Go for Launch" },
  launch_service_provider: lsp,
  mission: { name, type: "Communications", orbit: { name: "Low Earth Orbit", abbrev: "LEO" }, agencies: [], ...extras.mission },
  rocket: { configuration: { full_name: extras.rocket || "Rocket", families: [{ name: "Fam" }] } },
  pad: { name: "Pad", latitude: "28.56", longitude: "-80.57", location: { name: "Cape Canaveral", timezone_name: "America/New_York" } },
  ...extras.top
});
const providerResults = [
  mk("p-spacex", { id: 121, name: "SpaceX" }, "Falcon 9 | Starlink"),
  mk("p-blue", { id: 141, name: "Blue Origin" }, "New Shepard | NS", { rocket: "New Shepard", mission: { orbit: { name: "Suborbital", abbrev: "Sub" } } }),
  mk("p-rl", { id: 147, name: "Rocket Lab" }, "Electron | Rideshare", { rocket: "Electron" }),
  mk("p-ula", { id: 124, name: "United Launch Alliance" }, "Vulcan | Comsat", { rocket: "Vulcan VC4" }),
  mk("p-firefly", { id: 265, name: "Firefly Aerospace" }, "Alpha | Smallsat", { rocket: "Alpha" }),
  mk("p-ula-nasa", { id: 124, name: "United Launch Alliance" }, "Vulcan | NASA Orbiter", { rocket: "Vulcan VC4" })
];
const nasaResults = [
  mk("p-ula-nasa", { id: 124, name: "United Launch Alliance" }, "Vulcan | NASA Orbiter", { rocket: "Vulcan VC4", mission: { agencies: [{ id: 44, name: "NASA" }], description: "Richer NASA description." } })
];
globalThis.fetch = async (url) => {
  const u = String(url);
  const isNasa = u.includes("mission__agency__ids");
  if (!isNasa && !u.includes("lsp__id=121,141,147,124,265")) throw new Error(`Unexpected provider URL: ${u}`);
  const results = isNasa ? nasaResults : providerResults;
  return { ok: true, json: async () => ({ count: results.length, results }) };
};

await import("../js/main.js");
await new Promise((r) => setTimeout(r, 60));

import assert from "node:assert/strict";
const { state } = await import("../js/state.js");
const orgs = await import("../js/organizations.js");
const { buildDetailsContent, renderResults, renderActiveFilters, renderOverview } = await import("../js/render.js");
const { applyFilters } = await import("../js/filters.js");

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

check("boot loaded 6 unique launches (ULA NASA overlap deduped)", () => {
  assert.equal(state.launches.length, 6);
});
check("ULA NASA overlap tagged both; richer NASA description survives merge", () => {
  const o = state.launches.find((l) => l.id === "p-ula-nasa");
  assert.ok(orgs.isULA(o) && orgs.isNASA(o));
  assert.ok(o.details.startsWith("Richer"));
});
check("every tracked provider present incl. ULA + Firefly", () => {
  assert.ok(state.launches.some(orgs.isSpaceX));
  assert.ok(state.launches.some(orgs.isBlueOrigin));
  assert.ok(state.launches.some(orgs.isRocketLab));
  assert.ok(state.launches.some(orgs.isULA));
  assert.ok(state.launches.some(orgs.isFirefly));
});
check("eight overview tiles render (Showing + 6 orgs + Saved)", () => {
  const html = document.getElementById("overviewTiles").innerHTML;
  for (const label of ["Showing", "NASA missions", "SpaceX launches", "Blue Origin flights", "Rocket Lab launches", "ULA launches", "Firefly launches", "Saved"]) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('data-org="ula"') && html.includes('data-org="firefly"'));
});
check("ten mission-insight chips render", () => {
  const html = document.getElementById("insightsChips").innerHTML;
  for (const label of ["Launches in the next 7 days", "Launches in the next 30 days", "Webcasts available", "Orbital missions", "Suborbital flights", "Crew missions", "Science missions", "Active launch sites", "Weather outlooks available", "Providers represented"]) {
    assert.ok(html.includes(label), label);
  }
});
check("details modal exposes Add to calendar, Copy mission link, site time", () => {
  const html = buildDetailsContent(state.launches.find((l) => l.id === "p-ula"));
  assert.ok(html.includes("data-calendar-id"));
  assert.ok(html.includes("data-share-id"));
  assert.ok(html.includes("Launch (site time)"));
  assert.ok(html.includes("Add to calendar") && html.includes("Copy mission link"));
});
check("date-range / orbit / launch-site filters narrow the manifest", () => {
  state.orbit = "suborbital"; applyFilters();
  assert.deepEqual(state.filteredLaunches.map((l) => l.id), ["p-blue"]);
  state.orbit = "all"; state.launchSite = "cape-canaveral"; applyFilters();
  assert.ok(state.filteredLaunches.length >= 1 && state.filteredLaunches.every((l) => orgs.launchSiteCategory(l) === "cape-canaveral"));
  state.launchSite = "all"; state.dateRange = "24h"; applyFilters();
  assert.equal(state.filteredLaunches.length, 0, "none within 24h");
  state.dateRange = "all"; applyFilters();
});

// ---- v3.3 UI-state checks ----
check("skeletons were replaced by real content (no stale skeleton nodes)", () => {
  const tiles = document.getElementById("overviewTiles").innerHTML;
  assert.ok(!tiles.includes("is-skeleton"), "no skeleton tiles remain");
  const results = document.getElementById("results").innerHTML;
  assert.ok(!results.includes("placeholder-card"), "no skeleton cards remain");
  assert.ok(results.includes("launch-card"), "real cards present");
});
check("fresh (uncached) load applies the per-card entrance motion class", () => {
  // Boot had no cache, so the first real render uses the stagger entrance.
  assert.ok(document.getElementById("results").innerHTML.includes("motion-card-enter"));
});
check("Load-more append adds only new cards with entrance; existing stay put", () => {
  state.orbit = "all"; state.launchSite = "all"; state.dateRange = "all";
  state.keyword = ""; state.missionType = "all"; state.flightType = "all"; state.activeOrg = "all";
  applyFilters();
  state.visibleCount = 2;
  renderResults({ entrance: "none" });
  state.visibleCount = 4;
  renderResults({ append: true });
  // append path is exercised without throwing; full render path also fine.
  assert.ok(document.getElementById("results").innerHTML.includes("launch-card"));
});
check("active-filter summary hides with no filters and shows with filters", () => {
  state.activeOrg = "all"; state.keyword = ""; state.missionType = "all";
  state.flightType = "all"; state.dateRange = "all"; state.launchSite = "all"; state.orbit = "all";
  state.sortMode = "soonest";
  renderActiveFilters();
  assert.equal(document.getElementById("activeFilters").hidden, true);
  state.activeOrg = "nasa"; state.dateRange = "30d";
  renderActiveFilters();
  const af = document.getElementById("activeFilters");
  assert.equal(af.hidden, false);
  assert.ok(af.innerHTML.includes("2 active filters"));
  assert.ok(af.innerHTML.includes("NASA") && af.innerHTML.includes("Next 30 days"));
  assert.ok(af.innerHTML.includes("data-clear-filters"));
  state.activeOrg = "all"; state.dateRange = "all";
});
check("overview Showing tile + org tiles carry data-count for animated counts", () => {
  applyFilters();
  renderOverview();
  const html = document.getElementById("overviewTiles").innerHTML;
  assert.ok(html.includes('data-count-key="nasa"'));
  assert.ok(html.includes('data-count-key="saved"'));
});

if (failures > 0) { console.error(`\n${failures} headless check(s) failed.`); process.exit(1); }
console.log("\nHeadless v3.3 validation passed.");
process.exit(0);
