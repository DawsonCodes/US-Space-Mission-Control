// Updating is automatic. There is no refresh control, so these pin the two
// things that replaced it: the rolling window readout, and the rule that a
// one-feed result never replaces a more complete list.
//
// The NASA-only bug lived here. With the provider feed down, the only launches
// that came back were NASA-tagged ones, and the app rendered that as if it were
// the whole manifest.

import assert from "node:assert/strict";

const docListeners = {};
const autoTicks = [];

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
const nodes = new Map();
globalThis.document = {
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, makeEl(id)); return nodes.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  fire(type) { (docListeners[type] || []).forEach((fn) => fn({ type })); },
  visibilityState: "visible",
  get body() { return makeEl(); }
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
  // Capture the long interval (the auto-refresh) so the test can drive it.
  setInterval: (fn, ms) => { if (ms >= 60000) autoTicks.push(fn); return setInterval(fn, 1e9); },
  clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://dawsoncodes.github.io/US-Space-Mission-Control/", search: "", pathname: "/US-Space-Mission-Control/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS, AUTO_REFRESH_MS } = await import("../js/config.js");
const { simplifyLaunch } = await import("../js/normalize.js");

const rawLaunch = (id, lsp, agencies = []) => ({
  id, name: id, net: "2026-11-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: lsp, name: lsp === 121 ? "SpaceX" : "Other" },
  mission: { name: id, agencies },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", latitude: "", longitude: "", location: { name: "Cape Canaveral" } }
});

// A complete manifest already saved from an earlier good load.
const complete = [
  simplifyLaunch(rawLaunch("prov-1", 121)),
  simplifyLaunch(rawLaunch("prov-2", 121)),
  simplifyLaunch(rawLaunch("nasa-1", 121, [{ id: 44, name: "NASA" }]))
];
mem.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 3 * 60 * 60 * 1000,
  payload: { launches: complete, truncated: false }
}));

// No snapshot published; the provider feed is down, so only NASA answers. This
// is exactly the state that produced a NASA-only dashboard.
let providerFeedUp = false;
globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes(".json")) return { ok: false, status: 404, json: async () => ({}) };
  const isNasa = text.includes("mission__agency__ids");
  if (!isNasa && !providerFeedUp) throw new Error("provider feed down");
  const results = isNasa
    ? [rawLaunch("nasa-1", 121, [{ id: 44, name: "NASA" }])]
    : [rawLaunch("prov-1", 121), rawLaunch("prov-2", 121), rawLaunch("nasa-1", 121, [{ id: 44, name: "NASA" }])];
  return { ok: true, status: 200, json: async () => ({ count: results.length, results }) };
};

await import("../js/main.js");
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// Boot renders the saved data without touching the API. The provider-feed
// failure is then exercised by an automatic check, which is permitted to use the
// API because the saved data has aged past the fallback threshold.
await new Promise((r) => setTimeout(r, 200));
autoTicks.forEach((tick) => tick());
await new Promise((r) => setTimeout(r, 400));

// ---------- the NASA-only bug ---------------------------------------------
check("a provider-feed failure does not leave a NASA-only dashboard", () => {
  assert.equal(state.launches.length, 3, "the complete list is still on screen");
  assert.ok(state.launches.some((l) => l.id === "prov-1"), "provider launches survived");
});

check("the NASA-only result was not written over the cached manifest", () => {
  const cached = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(cached.payload.launches.length, 3);
  assert.ok(cached.payload.launches.some((l) => l.id === "prov-1"));
});

check("the reason is stated rather than silently swallowed", () => {
  // The banner escapes its text, so the apostrophe arrives as an entity.
  const status = nodes.get("status");
  assert.match(status.innerHTML, /provider feed didn(&#39;|')t respond/i);
  assert.match(status.innerHTML, /last complete list is still shown/i);
});

// ---------- the rolling window --------------------------------------------
check("there is no refresh control left in the page", () => {
  // Removing the element from index.html is only half of it; nothing in the app
  // should still be reaching for one.
  assert.equal(nodes.has("btnRefresh"), false, "btnRefresh was looked up");
  assert.equal(nodes.has("btnReloadLive"), false, "btnReloadLive was looked up");
});

check("the rolling window reports where the cycle stands", () => {
  // The seeded data is three hours old, so the honest reading is that an update
  // is overdue rather than a made-up countdown.
  const text = nodes.get("refreshWindowText").textContent;
  assert.match(text, /Updated .* ago\. Next update (due now|in \d+ minutes?)\./, `unexpected readout: ${text}`);
});

check("an automatic check is actually scheduled", () => {
  assert.ok(autoTicks.length > 0, "no auto-refresh interval was registered");
});

check("the interval matches the documented 30-minute window", () => {
  assert.equal(AUTO_REFRESH_MS, 30 * 60 * 1000);
});

// ---------- recovery -------------------------------------------------------
providerFeedUp = true;
autoTicks.forEach((tick) => tick());
await new Promise((r) => setTimeout(r, 150));

check("the next automatic check restores the full list once the feed recovers", () => {
  assert.equal(state.launches.length, 3);
  assert.ok(state.launches.some((l) => l.id === "prov-1"));
  const cached = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(cached.payload.launches.length, 3, "a complete load is cached again");
});

if (failures > 0) { console.error(`\n${failures} auto-refresh check(s) failed.`); process.exit(1); }
console.log("\nAuto-refresh checks passed.");
process.exit(0);
