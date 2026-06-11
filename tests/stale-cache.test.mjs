// Integration: a STALE-but-usable cache stays visible (non-destructively) when
// the background live refresh fails, with an honest "from N ago" message.

function makeEl() {
  const classes = new Set();
  const style = { setProperty() {}, removeProperty() {} };
  return {
    dataset: {}, style, hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0, open: false,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    attrs: {},
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute() {},
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML(_p, h) { this.innerHTML += h; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; }, contains() { return false; },
    focus() {}, scrollIntoView() {}, getContext() { return null; }, get offsetWidth() { return 0; }
  };
}
const store = new Map();
globalThis.document = {
  _els: new Map(),
  getElementById(id) { if (!this._els.has(id)) this._els.set(id, makeEl()); return this._els.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener() {}, get body() { return makeEl(); }
};
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  setInterval: setInterval.bind(globalThis), clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://x.dev/app/", search: "", pathname: "/app/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS } = await import("../js/config.js");

// Seed a STALE cache (40 minutes old).
const cached = [
  { id: "c-1", name: "Cached One", net: "2026-09-01T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null },
  { id: "c-2", name: "Cached Two", net: "2026-09-02T00:00:00Z", providerName: "SpaceX", providerId: 121, agencies: [], padLat: null, padLon: null }
];
store.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 40 * 60 * 1000,
  payload: { launches: cached, truncated: false }
}));

// Live refresh always fails.
globalThis.fetch = async () => { throw new Error("refresh failed"); };

await import("../js/main.js");

import assert from "node:assert/strict";
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

await new Promise((r) => setTimeout(r, 150));

check("stale cache rendered immediately on boot", () => {
  assert.equal(state.launches.length, 2);
  assert.equal(state.dataSource, "cache");
});
check("after the refresh fails, cached data stays visible (non-destructive)", () => {
  assert.equal(state.dataSource, "cache");
  assert.equal(state.launches.length, 2);
});
check("status honestly explains the cached data is shown because refresh failed", () => {
  const statusHtml = document.getElementById("status").innerHTML;
  assert.ok(/because the live refresh failed/i.test(statusHtml), `status was: ${statusHtml}`);
  assert.ok(/cached launch data from/i.test(statusHtml));
});

if (failures > 0) { console.error(`\n${failures} stale-cache check(s) failed.`); process.exit(1); }
console.log("\nStale-cache fallback passed.");
process.exit(0);
