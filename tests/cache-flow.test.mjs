// Integration harness: boots main.js with a pre-seeded FRESH manifest cache and
// a controllable fetch to verify cache-first rendering (instant cached render →
// background live refresh → cache updated with fresh data). Minimal DOM shim.

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
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  setInterval: setInterval.bind(globalThis), clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://dawsoncodes.github.io/US-Space-Mission-Control/", search: "", pathname: "/US-Space-Mission-Control/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS } = await import("../js/config.js");

// Seed a FRESH cache (5 minutes old) with two launches that have NO coordinates
// (so no weather fetch noise).
const cachedLaunches = [
  { id: "cache-1", name: "Cached One", net: "2026-09-01T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null },
  { id: "cache-2", name: "Cached Two", net: "2026-09-02T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null }
];
mem.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 5 * 60 * 1000,
  payload: { launches: cachedLaunches, truncated: false }
}));

// Live feed returns three different launches (provider feed); NASA feed empty.
const liveRaw = (id, name) => ({
  id, name, net: "2026-10-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name, type: "Communications", orbit: { name: "LEO", abbrev: "LEO" }, agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [{ name: "Falcon" }] } },
  pad: { name: "Pad", latitude: "", longitude: "", location: { name: "Cape Canaveral" } }
});
globalThis.fetch = async (url) => {
  // Small macrotask delay so the cache-first render phase is observable before
  // the background live refresh resolves.
  await new Promise((r) => setTimeout(r, 30));
  const isNasa = String(url).includes("mission__agency__ids");
  const results = isNasa ? [] : [liveRaw("live-1", "Live One"), liveRaw("live-2", "Live Two"), liveRaw("live-3", "Live Three")];
  return { ok: true, json: async () => ({ count: results.length, results }) };
};

await import("../js/main.js");

import assert from "node:assert/strict";
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

// Immediately after boot (before the background refresh resolves), cached data
// is already on screen.
check("cache-first: cached data is rendered immediately on boot", () => {
  assert.equal(state.dataSource, "cache");
  assert.equal(state.launches.length, 2);
  assert.equal(state.launches[0].id, "cache-1");
});

// Let the background live refresh resolve.
await new Promise((r) => setTimeout(r, 60));

check("background refresh replaces cached data with fresh live data", () => {
  assert.equal(state.dataSource, "live");
  assert.equal(state.launches.length, 3);
  assert.ok(state.launches.some((l) => l.id === "live-1"));
  assert.ok(!state.launches.some((l) => l.id === "cache-1"));
});

check("the fresh live manifest is written back to the cache", () => {
  const raw = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(raw.schema, MANIFEST_CACHE_SCHEMA);
  const ids = raw.payload.launches.map((l) => l.id).sort();
  assert.deepEqual(ids, ["live-1", "live-2", "live-3"]);
});

if (failures > 0) { console.error(`\n${failures} cache-flow check(s) failed.`); process.exit(1); }
console.log("\nCache-flow integration passed.");
process.exit(0);
