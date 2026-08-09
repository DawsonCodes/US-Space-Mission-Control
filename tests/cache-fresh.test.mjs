// Request budget: LL2 allows roughly 15 requests an hour, so a cache that is
// still fresh must render with no network at all. Refreshing on every tab open
// was spending the whole allowance re-fetching launches that had not moved,
// which is what left the live API failing on reopen.

function makeEl(id = "") {
  const classes = new Set();
  const attrs = {};
  return {
    id, dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "",
    tabIndex: 0, open: false,
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

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS, CACHE_FRESH_MS } = await import("../js/config.js");

// A cache well inside the freshness window.
const cachedLaunches = [
  { id: "cache-1", name: "Cached One", net: "2026-09-01T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null },
  { id: "cache-2", name: "Cached Two", net: "2026-09-02T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null }
];
mem.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 5 * 60 * 1000,
  payload: { launches: cachedLaunches, truncated: false }
}));

let requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  return { ok: true, json: async () => ({ count: 0, results: [] }) };
};

await import("../js/main.js");

import assert from "node:assert/strict";
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// Give any background work a chance to fire before asserting it did not.
await new Promise((r) => setTimeout(r, 80));

check("a fresh cache renders without spending a single request", () => {
  const launchRequests = requests.filter((u) => u.includes("thespacedevs.com"));
  assert.deepEqual(launchRequests, [], `unexpected launch requests: ${launchRequests.join(", ")}`);
});

check("the cached launches are what is on screen", () => {
  assert.equal(state.dataSource, "cache");
  assert.equal(state.launches.length, 2);
  assert.equal(state.launches[0].id, "cache-1");
});

check("the cached manifest is left untouched", () => {
  const raw = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.deepEqual(raw.payload.launches.map((l) => l.id), ["cache-1", "cache-2"]);
});

check("the freshness window is a real bound, not effectively infinite", () => {
  assert.ok(CACHE_FRESH_MS > 0 && CACHE_FRESH_MS <= 60 * 60 * 1000);
});

if (failures > 0) { console.error(`\n${failures} fresh-cache check(s) failed.`); process.exit(1); }
console.log("\nFresh-cache request-budget checks passed.");
process.exit(0);
