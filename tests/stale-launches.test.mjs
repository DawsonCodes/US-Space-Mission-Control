// Launches left behind by a stale published file.
//
// Launch Library's upcoming feed never contains a launch that has already flown,
// so a launch hours past its NET in our list can only mean the file has not been
// refreshed. When the scheduled workflow stalled for a week, the dashboard's
// Featured Mission was a Starlink flight from seven days earlier, still reading
// "Live / passed". These checks pin the rule that drops them, and the trap that
// came with it: filtering only what is on screen makes every automatic check see
// a "changed" list and re-render the page every half hour.

import assert from "node:assert/strict";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const at = (ms) => new Date(Date.now() + ms).toISOString();

const docListeners = {};
function makeEl(id = "") {
  const classes = new Set();
  const attrs = {};
  return {
    id, dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, disabled: false, value: "", textContent: "", innerHTML: "", tabIndex: 0, open: false,
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
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  setInterval: () => 0, clearInterval() {},
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://dawsoncodes.github.io/US-Space-Mission-Control/", search: "", pathname: "/US-Space-Mission-Control/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

const { SNAPSHOT_SCHEMA, FLOWN_AFTER_NET_MS } = await import("../js/config.js");

const card = (id, net, extra = {}) => ({
  id, name: id, net, statusName: "Go for Launch", providerId: 121, providerName: "SpaceX",
  agencies: [], padLat: null, padLon: null, ...extra
});

// A file published a week ago, as it was when the workflow stalled.
const published = {
  schema: SNAPSHOT_SCHEMA,
  generatedAt: at(-7 * DAY),
  truncated: false,
  launches: [
    card("flew-a-week-ago", at(-7 * DAY + HOUR)),
    card("flew-yesterday", at(-DAY)),
    card("in-a-hold-two-hours", at(-2 * HOUR), { statusName: "Hold" }),
    card("tomorrow", at(DAY)),
    card("next-week", at(7 * DAY)),
    card("no-date-yet", "")
  ]
};

let launchFetches = 0;
globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes("previous.json")) return { ok: true, json: async () => ({ schema: SNAPSHOT_SCHEMA, generatedAt: at(-DAY), launches: [] }) };
  if (text.includes("launches.json")) { launchFetches += 1; return { ok: true, json: async () => published }; }
  throw new Error(`no API calls expected: ${text}`);
};

const { withoutFlown } = await import("../js/filters.js");
await import("../js/main.js");
const { state } = await import("../js/state.js");
await new Promise((r) => setTimeout(r, 250));

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- the rule ---------------------------------------------------------
check("a launch long past its NET is dropped, a recent one is kept", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const iso = (ms) => new Date(now + ms).toISOString();
  const kept = withoutFlown(
    [
      { id: "week", net: iso(-7 * DAY) },
      { id: "seven-hours", net: iso(-7 * HOUR) },
      { id: "five-hours", net: iso(-5 * HOUR) },
      { id: "future", net: iso(HOUR) },
      { id: "unparseable", net: "TBD" },
      { id: "missing" }
    ],
    now
  ).map((l) => l.id);
  assert.deepEqual(kept, ["five-hours", "future", "unparseable", "missing"]);
});

check("the margin covers a hold or a late refresh, and no more than a day", () => {
  assert.ok(FLOWN_AFTER_NET_MS >= 2 * HOUR, "a launch in a hold would vanish mid-countdown");
  assert.ok(FLOWN_AFTER_NET_MS <= DAY, "a week-old launch could still be featured");
});

check("a launch with no date is not treated as flown", () => {
  // Missing data is not evidence that a launch has happened.
  assert.equal(withoutFlown([{ id: "x", net: null }]).length, 1);
  assert.deepEqual(withoutFlown(null), []);
});

// ---------- the app, booted on a week-old file -------------------------------
check("the Featured Mission is never a launch that flew days ago", () => {
  assert.ok(state.nextLaunch, "nothing was featured at all");
  assert.notEqual(state.nextLaunch.id, "flew-a-week-ago");
  assert.notEqual(state.nextLaunch.id, "flew-yesterday");
});

check("long-flown launches are gone from the list, recent and future ones remain", () => {
  const ids = state.launches.map((l) => l.id);
  assert.ok(!ids.includes("flew-a-week-ago"), "a week-old launch is still listed");
  assert.ok(!ids.includes("flew-yesterday"), "yesterday's launch is still listed");
  for (const id of ["in-a-hold-two-hours", "tomorrow", "next-week", "no-date-yet"]) {
    assert.ok(ids.includes(id), `${id} was dropped`);
  }
});

check("the startup message counts what is actually shown", () => {
  const status = nodes.get("status");
  assert.match(status.innerHTML, /\b4 upcoming launches\b/, `count does not match the list: ${status.innerHTML.slice(0, 120)}`);
});

// ---------- the trap ---------------------------------------------------------
// An automatic check re-reads the same file. If only the on-screen list were
// filtered, it would never equal the incoming one and the page would re-render,
// with an "Updated." banner, every half hour for as long as the file is stale.
const realNow = Date.now;
Date.now = () => realNow() + 31 * 60 * 1000;
const fetchesBefore = launchFetches;
nodes.get("status").innerHTML = "";
document.fire("visibilitychange");
await new Promise((r) => setTimeout(r, 250));
Date.now = realNow;

check("an automatic check actually ran against the same file", () => {
  assert.ok(launchFetches > fetchesBefore, "the visibility check did not re-read the file");
});

check("an unchanged stale file is recognised as unchanged", () => {
  const status = nodes.get("status");
  assert.ok(!/Updated\./.test(status.innerHTML), `the page re-rendered for nothing: ${status.innerHTML.slice(0, 120)}`);
  assert.ok(!state.launches.some((l) => l.id === "flew-a-week-ago"), "the flown launch came back");
});

if (failures > 0) { console.error(`\n${failures} stale-launch check(s) failed.`); process.exit(1); }
console.log("\nStale-launch checks passed.");
process.exit(0);
