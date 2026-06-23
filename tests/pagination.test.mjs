// Pagination-control visibility tests. Covers the JS logic (renderResults sets
// the `hidden` property correctly across scenarios) AND the CSS regression that
// was the real bug — `.btn { display: inline-flex }` overriding the HTML
// `hidden` attribute, so the buttons need an explicit `.btn[hidden]` rule.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---- minimal DOM shim (installed before importing render.js) -------------
function makeEl() {
  const classes = new Set();
  const style = { setProperty() {}, removeProperty() {} };
  return {
    dataset: {}, style, hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    focus() {}, scrollIntoView() {}, getContext() { return null; }, get offsetWidth() { return 0; }
  };
}
const els = new Map();
globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener() {}, get body() { return makeEl(); }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0 };

const { state } = await import("../js/state.js");
const { DEFAULT_VISIBLE } = await import("../js/config.js");
const { applyFilters } = await import("../js/filters.js");
const { renderResults } = await import("../js/render.js");

const btnLoadMore = document.getElementById("btnLoadMore");
const btnShowAll = document.getElementById("btnShowAll");

function makeLaunches(n, namePrefix = "Mission") {
  return Array.from({ length: n }, (_, i) => ({
    id: `l-${i}`,
    name: `${namePrefix} ${i}`,
    net: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    providerName: "SpaceX", providerId: 121, agencies: [],
    rocket: "Falcon 9", orbitName: "LEO", padLat: null, padLon: null
  }));
}

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

function setManifest(launches) {
  state.launches = launches;
  state.activeOrg = "all"; state.missionType = "all"; state.flightType = "all";
  state.dateRange = "all"; state.launchSite = "all"; state.orbit = "all"; state.keyword = "";
  applyFilters();
}

check("more results than visible → both controls shown", () => {
  setManifest(makeLaunches(25));
  state.visibleCount = DEFAULT_VISIBLE; // 10
  renderResults();
  assert.equal(btnLoadMore.hidden, false);
  assert.equal(btnShowAll.hidden, false);
});

check("Load 10 more → still more remaining → controls stay shown", () => {
  state.visibleCount = 20;
  renderResults({ append: true });
  assert.equal(btnLoadMore.hidden, false);
  assert.equal(btnShowAll.hidden, false);
});

check("Show all (visible === total) → both controls hidden", () => {
  state.visibleCount = state.filteredLaunches.length; // 25
  renderResults({ append: true });
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
});

check("Load 10 more reaching the end hides both controls", () => {
  setManifest(makeLaunches(14));
  state.visibleCount = DEFAULT_VISIBLE; // 10 of 14
  renderResults();
  assert.equal(btnLoadMore.hidden, false, "more remain → shown");
  state.visibleCount = Math.min(state.visibleCount + 10, state.filteredLaunches.length); // 14
  renderResults({ append: true });
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
});

check("short filtered list (≤ initial batch) → no pagination controls", () => {
  setManifest(makeLaunches(6));
  state.visibleCount = DEFAULT_VISIBLE;
  renderResults();
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
});

check("exactly the initial batch (10 of 10) → no pagination controls", () => {
  setManifest(makeLaunches(10));
  state.visibleCount = DEFAULT_VISIBLE;
  renderResults();
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
});

check("zero filtered results → no pagination controls", () => {
  setManifest(makeLaunches(25));
  state.keyword = "zzz-definitely-no-match";
  applyFilters();
  state.visibleCount = DEFAULT_VISIBLE;
  renderResults();
  assert.equal(state.filteredLaunches.length, 0);
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
  state.keyword = "";
});

check("filtering down to a short list re-hides controls", () => {
  setManifest(makeLaunches(25, "Falcon"));
  state.visibleCount = DEFAULT_VISIBLE;
  renderResults();
  assert.equal(btnLoadMore.hidden, false, "25 results → shown");
  // Narrow to a handful via search.
  state.launches = makeLaunches(25, "Falcon").map((l, i) => (i < 3 ? { ...l, name: `Vulcan ${i}` } : l));
  state.keyword = "vulcan";
  applyFilters();
  state.visibleCount = DEFAULT_VISIBLE;
  renderResults();
  assert.equal(state.filteredLaunches.length, 3);
  assert.equal(btnLoadMore.hidden, true);
  assert.equal(btnShowAll.hidden, true);
  state.keyword = "";
});

// ---- the actual visual bug: CSS must let `hidden` win over `.btn` ----------
check("CSS: .btn[hidden] forces display:none (fixes the visibility bug)", () => {
  const css = readFileSync("styles/components.css", "utf8");
  assert.match(css, /\.btn\[hidden\]\s*\{[^}]*display:\s*none/s);
});

if (failures > 0) { console.error(`\n${failures} pagination test(s) failed.`); process.exit(1); }
console.log("\nAll pagination tests passed.");
