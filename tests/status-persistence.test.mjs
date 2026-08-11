// The rolling-window readout and the status-banner timing.
//
// Two reported bugs live here. The countdown restarted at thirty minutes on
// every reload and in every new tab, because it was anchored to a per-session
// timestamp rather than to when the data was actually published. And the
// "Showing saved launch data" banner flashed and vanished, because the startup
// path dismissed it a few hundred milliseconds after raising it, and because
// the boot overlay spent several seconds of its ten-second life before anyone
// could see it.

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
  documentElement: makeEl("html"),
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
  setInterval: (fn, ms) => { if (ms >= 60000) autoTicks.push(fn); return setInterval(fn, 1e9); },
  clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://dawsoncodes.github.io/US-Space-Mission-Control/", search: "", pathname: "/US-Space-Mission-Control/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS } = await import("../js/config.js");

// A usable saved copy, and no published snapshot. This is the exact state that
// made the "Showing saved launch data" banner flash and vanish: startup raised
// it, then the loader dismissed it a few hundred milliseconds later because
// withholding the API counted as a failure.
// Saved 8 minutes ago, but published 19 minutes ago. The two differ because a
// browser saves the file some time after the workflow wrote it, and the
// countdown must follow the publish time.
const PUBLISHED_MINUTES_AGO = 19;
mem.set(STORAGE_KEYS.manifest, JSON.stringify({
  schema: MANIFEST_CACHE_SCHEMA,
  savedAt: Date.now() - 8 * 60 * 1000,
  payload: {
    launches: [
      { id: "c1", name: "Saved One", net: "2026-12-01T00:00:00Z", providerId: 121, providerName: "SpaceX", agencies: [], padLat: null, padLon: null }
    ],
    truncated: false,
    generatedAt: Date.now() - PUBLISHED_MINUTES_AGO * 60 * 1000
  }
}));

let apiCalls = 0;
globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes(".json")) return { ok: false, status: 404, json: async () => ({}) };
  apiCalls += 1;
  throw new Error("the API should not be called with recent saved data");
};

await import("../js/main.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// Well past the point where the old code had already wiped it.
await new Promise((r) => setTimeout(r, 400));

check("the saved-data banner survives startup instead of flashing away", () => {
  const status = nodes.get("status");
  assert.equal(status.hidden, false, "the banner was dismissed during startup");
  assert.match(status.innerHTML, /Showing saved launch data from/i, `unexpected banner: ${status.innerHTML}`);
});

check("it settles on a final wording rather than staying on 'checking'", () => {
  const status = nodes.get("status");
  assert.ok(
    !/Checking for an update/i.test(status.innerHTML),
    "the banner should settle once there is nothing left to check"
  );
});

check("it still carries a countdown, so it is not stuck on screen forever", () => {
  const status = nodes.get("status");
  assert.match(status.innerHTML, /data-status-count/);
});

check("no API request was spent to reach that state", () => {
  assert.equal(apiCalls, 0);
});

check("the countdown on a cached first paint follows the publish time", () => {
  // Without the publish stamp travelling through the cache, this would anchor
  // to when the browser saved the file and read about 22 minutes instead.
  const text = nodes.get("refreshWindowText").textContent;
  const ago = Number(/Updated (\d+) minutes? ago/.exec(text)?.[1]);
  assert.ok(
    Math.abs(ago - PUBLISHED_MINUTES_AGO) <= 1,
    `expected about ${PUBLISHED_MINUTES_AGO} minutes, got ${ago} (${text})`
  );
});

if (failures > 0) { console.error(`\n${failures} status-persistence check(s) failed.`); process.exit(1); }
console.log("\nStatus-persistence checks passed.");
process.exit(0);
