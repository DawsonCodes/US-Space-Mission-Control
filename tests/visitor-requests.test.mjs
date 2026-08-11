// The point of the snapshot: a visitor never calls Launch Library.
//
// LL2 allows roughly 15 requests an hour per browser, which is what kept
// leaving the dashboard rate limited or half-loaded. Everything now comes from
// a static JSON file that a scheduled workflow publishes, served from the same
// origin as the page, so no visitor can exhaust anything. This pins that: boot
// the app and assert that nothing in the request log points at thespacedevs.

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

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS, AUTO_REFRESH_MS } = await import("../js/config.js");

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

const { simplifyLaunch } = await import("../js/normalize.js");
const published = [
  { id: "snap-1", name: "Published One", net: "2026-11-01T00:00:00Z", status: { name: "Go for Launch" },
    launch_service_provider: { id: 121, name: "SpaceX" }, mission: { name: "m", agencies: [] },
    rocket: { configuration: { full_name: "Falcon 9", families: [] } },
    pad: { name: "Pad", latitude: "", longitude: "", location: { name: "Cape Canaveral" } } }
].map(simplifyLaunch);

let requests = [];
const fetchOptions = new Map();
globalThis.fetch = async (url, options = {}) => {
  requests.push(String(url));
  fetchOptions.set(String(url), options);
  if (String(url).includes("previous.json")) {
    return { ok: true, json: async () => ({ schema: 1, generatedAt: new Date().toISOString(), launches: [] }) };
  }
  return {
    ok: true,
    json: async () => ({
      schema: 1,
      generatedAt: new Date().toISOString(),
      truncated: false,
      launches: published
    })
  };
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

check("a visitor makes no Launch Library request", () => {
  const apiCalls = requests.filter((u) => u.includes("thespacedevs.com"));
  assert.deepEqual(apiCalls, [], `unexpected launch API calls: ${apiCalls.join(", ")}`);
});

check("the data came from the published snapshot", () => {
  assert.ok(requests.some((u) => u.includes("data/launches.json")), "snapshot was never requested");
  assert.equal(state.dataSource, "snapshot");
  assert.equal(state.launches[0].id, "snap-1");
});

check("the snapshot path is relative, so the Pages project subpath still works", () => {
  const snap = requests.find((u) => u.includes("launches.json"));
  assert.ok(!snap.startsWith("/"), `snapshot path must not be root-absolute: ${snap}`);
  assert.ok(!/^https?:/.test(snap), `snapshot must be same-origin: ${snap}`);
});

check("the snapshot is revalidated rather than blindly re-downloaded", () => {
  // cache: "no-cache" makes the browser send a conditional request, so an
  // unchanged snapshot comes back as a 304 with no body.
  assert.equal(fetchOptions.get("data/launches.json")?.cache, "no-cache");
});

check("the auto-refresh interval is a real, sane cadence", () => {
  assert.ok(AUTO_REFRESH_MS >= 5 * 60 * 1000, "refreshing more often than every 5 minutes is pointless");
  assert.ok(AUTO_REFRESH_MS <= 60 * 60 * 1000, "an hour between checks is too stale");
});

if (failures > 0) { console.error(`\n${failures} fresh-cache check(s) failed.`); process.exit(1); }
console.log("\nVisitor-request checks passed.");
process.exit(0);
