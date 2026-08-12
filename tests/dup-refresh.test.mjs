// Integration: two rapid manual refreshes must not run as duplicate in-flight
// loads — the earlier request is aborted and only the latest survives.

function makeEl(id = "") {
  const classes = new Set();
  const style = { setProperty() {}, removeProperty() {} };
  const listeners = {};
  return {
    id, _listeners: listeners, dataset: {}, style, hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0, open: false,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    attrs: {},
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    fire(type) { (listeners[type] || []).forEach((fn) => fn({ target: this, currentTarget: this })); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute() {},
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    focus() {}, scrollIntoView() {}, getContext() { return null; }, get offsetWidth() { return 0; }
  };
}
const store = new Map();
const els = new Map();
const docListeners = {};
const autoTicks = [];
globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  fire(type) { (docListeners[type] || []).forEach((fn) => fn({ type })); },
  visibilityState: "visible",
  get body() { return makeEl(); }
};
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  // The auto-refresh is a self-rescheduling long timeout now, not an interval,
  // so the test captures that instead of waiting out the real cycle. Short
  // timers still run normally.
  setInterval: (fn, ms) => setInterval(fn, ms >= 60000 ? 1e9 : ms),
  clearInterval: clearInterval.bind(globalThis),
  setTimeout: (fn, ms) => {
    if (ms >= 60000) { autoTicks.push(fn); return 0; }
    return setTimeout(fn, ms);
  },
  clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://x.dev/app/", search: "", pathname: "/app/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS } = await import("../js/config.js");
const { simplifyLaunch: simplify } = await import("../js/normalize.js");
// Seed a FRESH cache so the initial background refresh is a single, simple round.
store.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 2 * 60 * 1000,
  payload: { launches: [{ id: "c-1", name: "Cached", net: "2026-09-01T00:00:00Z", providerId: 121, agencies: [], padLat: null, padLon: null }], truncated: false }
}));

const raw = (id) => ({
  id, name: id, net: "2026-10-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: id, type: "Communications", orbit: { name: "LEO", abbrev: "LEO" }, agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [{ name: "Falcon" }] } },
  pad: { name: "Pad", latitude: "", longitude: "", location: { name: "Cape Canaveral" } }
});
const signals = [];
// Everything now comes from the committed snapshot, so that is what a refresh
// requests. One request per refresh instead of one per feed.
globalThis.fetch = async (url, opts = {}) => {
  signals.push(opts.signal);
  await new Promise((r) => setTimeout(r, 50)); // stay in-flight a moment
  if (String(url).includes("previous.json")) {
    return { ok: true, json: async () => ({ schema: 1, generatedAt: new Date().toISOString(), launches: [] }) };
  }
  return {
    ok: true,
    json: async () => ({
      schema: 1,
      generatedAt: new Date().toISOString(),
      truncated: false,
      launches: [simplify(raw("live-1"))]
    })
  };
};

await import("../js/main.js");

import assert from "node:assert/strict";

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

// Let the initial cache-first background refresh settle.
await new Promise((r) => setTimeout(r, 160));

// There is no refresh button any more; updating is automatic. The equivalent
// burst is two automatic checks landing back to back, which is what happens when
// a backgrounded tab is revealed just as the interval fires.
signals.length = 0;
autoTicks.forEach((tick) => tick());
autoTicks.forEach((tick) => tick());

// Synchronously after the burst, the first request's signal must be aborted.
// (Driven through the captured interval callback, since the real one fires on a
// 30-minute cadence.)
check("two rapid refreshes: the earlier request is aborted (no duplicate in-flight)", () => {
  assert.ok(signals.length >= 2, `expected >=2 snapshot calls across two rounds, got ${signals.length}`);
  assert.ok(signals[0].aborted, "first round aborted");
  assert.ok(!signals[signals.length - 1].aborted, "latest round not aborted");
});

await new Promise((r) => setTimeout(r, 120));
const { state } = await import("../js/state.js");
check("only the latest refresh applied its result", () => {
  assert.equal(state.dataSource, "snapshot");
  assert.equal(state.launches.length, 1);
  assert.equal(state.launches[0].id, "live-1");
});

if (failures > 0) { console.error(`\n${failures} dup-refresh check(s) failed.`); process.exit(1); }
console.log("\nDuplicate-refresh prevention passed.");
process.exit(0);
