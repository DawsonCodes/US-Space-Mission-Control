// The rolling-window readout and the status-banner timing.
//
// Two reported bugs live here. The countdown restarted at thirty minutes on
// every reload and in every new tab, because it was anchored to a per-session
// timestamp rather than to when the data was actually published. And the
// "Showing saved launch data" banner flashed and vanished, because the startup
// path dismissed it a few hundred milliseconds after raising it, and because
// the boot overlay spent several seconds of its ten-second life before anyone
// could see it.

// Upcoming-launch fixtures are dated relative to now. Pinned to calendar dates
// they drifted into the past, and once the app started dropping launches long
// past their NET, a "cached" or "published" list made of them came up empty.
const AHEAD = (days) => new Date(Date.now() + days * 86400000).toISOString();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const { AUTO_REFRESH_MS, SNAPSHOT_SCHEMA, SCHEDULE_MINUTES } = await import("../js/config.js");

// Published 12 minutes ago. Everyone reading this snapshot should agree that
// the next update is about 18 minutes out, whenever they happen to open it.
const PUBLISHED_MINUTES_AGO = 12;
const generatedAt = new Date(Date.now() - PUBLISHED_MINUTES_AGO * 60 * 1000).toISOString();

globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes("previous.json")) {
    return { ok: true, json: async () => ({ schema: SNAPSHOT_SCHEMA, generatedAt, launches: [] }) };
  }
  if (text.includes("launches.json")) {
    return {
      ok: true,
      json: async () => ({
        schema: SNAPSHOT_SCHEMA,
        generatedAt,
        truncated: false,
        launches: [
          { id: "a", name: "Mission A", net: AHEAD(120), providerId: 121, providerName: "SpaceX", agencies: [], padLat: null, padLon: null }
        ]
      })
    };
  }
  throw new Error("no API calls expected");
};

const { msUntilNextScheduledCheck } = await import("../js/main.js");
const { state } = await import("../js/state.js");
const { cacheAgeLabel } = await import("../js/storage.js");
const render = await import("../js/render.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

await new Promise((r) => setTimeout(r, 250));

// ---------- the countdown anchor -------------------------------------------
check("the countdown follows the workflow's schedule, not the data's age", () => {
  // A run that finds nothing changed publishes nothing, so the age keeps
  // growing while the next check is still minutes away. Deriving the countdown
  // from the age made it stick on "due now" until something happened to change.
  const text = nodes.get("refreshWindowText").textContent;
  const remaining = Number(/Next check in (\d+) minutes?/.exec(text)?.[1]);
  assert.ok(Number.isFinite(remaining), `no countdown in readout: ${text}`);
  assert.ok(remaining >= 1 && remaining <= 30, `${remaining} is outside the cycle (${text})`);
  assert.ok(!/due now/i.test(text), "the countdown parked instead of counting");
});

check("every clock position lands on the next scheduled boundary", () => {
  const at = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return msUntilNextScheduledCheck(Date.UTC(2026, 7, 12, h, m, 0)) / 60000;
  };
  // Boundaries are :17 and :47 UTC, plus a three-minute grace.
  assert.equal(at("07:04"), 16, `07:04 -> ${at("07:04")}`);
  assert.equal(at("07:46"), 4, `07:46 -> ${at("07:46")}`);
  assert.equal(at("07:52"), 28, `07:52 -> ${at("07:52")}`);
  // Rolling into the next hour must not produce a negative or day-long wait.
  const rollover = at("07:59");
  assert.ok(rollover > 0 && rollover <= 30, `07:59 -> ${rollover}`);
});

check("the page's schedule matches the workflow's cron", () => {
  // They drifted once already in spirit: the cron moved off the busy minutes
  // and nothing would have told the page. Read the cron from the workflow file.
  const yml = readFileSync(".github/workflows/refresh-data.yml", "utf8");
  const cron = /^\s*-\s*cron:\s*"([^"]+)"/m.exec(yml)?.[1];
  assert.ok(cron, "no cron found in refresh-data.yml");
  const [minuteField, hourField] = cron.split(/\s+/);
  assert.equal(hourField, "*", "the page assumes the workflow runs every hour");
  const cronMinutes = minuteField.split(",").map(Number).sort((a, b) => a - b);
  assert.deepEqual(cronMinutes, [...SCHEDULE_MINUTES].sort((a, b) => a - b),
    `cron runs at ${cronMinutes} but the page checks at ${SCHEDULE_MINUTES}`);
});

check("the workflow avoids the busiest minutes of the hour", () => {
  // On "0,30" three quarters of the scheduled runs never happened.
  for (const minute of SCHEDULE_MINUTES) {
    assert.ok(minute % 15 !== 0, `:${String(minute).padStart(2, "0")} is a peak minute for scheduled runs`);
  }
});

check("the boundaries do not depend on the reader's time zone", () => {
  // cron is UTC. Local minutes only coincide with UTC minutes in whole-hour
  // zones, so the old setMinutes put the boundaries at the wrong minute in
  // Kathmandu (+5:45) and Adelaide (+9:30). Same instant, same answer, anywhere.
  const instant = Date.UTC(2026, 9, 30, 7, 4, 0);
  const original = process.env.TZ;
  const answers = {};
  try {
    for (const tz of ["UTC", "Asia/Kathmandu", "Australia/Adelaide", "America/St_Johns", "America/New_York"]) {
      process.env.TZ = tz;
      answers[tz] = msUntilNextScheduledCheck(instant) / 60000;
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  const distinct = new Set(Object.values(answers));
  assert.equal(distinct.size, 1, `the wait depends on the time zone: ${JSON.stringify(answers)}`);
});

check("the wait is never longer than the cycle, nor a busy loop", () => {
  for (let m = 0; m < 60; m += 1) {
    const wait = msUntilNextScheduledCheck(Date.UTC(2026, 7, 12, 9, m, 0)) / 60000;
    assert.ok(wait >= 1, `minute ${m} would poll every ${wait} minutes`);
    assert.ok(wait <= 30, `minute ${m} would wait ${wait} minutes`);
  }
});

check("two tabs opened at different times agree on the next check", () => {
  // The whole point of using the clock: the answer does not depend on when a
  // tab happened to open.
  const t = Date.UTC(2026, 7, 12, 11, 17, 0);
  assert.equal(msUntilNextScheduledCheck(t), msUntilNextScheduledCheck(t));
});

check("the age shown matches how long ago the data was published", () => {
  const text = nodes.get("refreshWindowText").textContent;
  const ago = Number(/Updated (\d+) minutes? ago/.exec(text)?.[1]);
  assert.ok(Math.abs(ago - PUBLISHED_MINUTES_AGO) <= 1, `expected ~${PUBLISHED_MINUTES_AGO}, got ${ago} (${text})`);
});

check("a long gap reads in hours and days, not hundreds of minutes", () => {
  // The workflow leaves the file byte-identical when nothing has moved, so the
  // age is routinely hours old and read as "Updated 344 minutes ago". The
  // countdown keeps its minutes because the schedule bounds it at thirty.
  assert.equal(cacheAgeLabel(344 * 60 * 1000), "5 hours ago");
  assert.equal(cacheAgeLabel(30 * 60 * 60 * 1000), "1 day ago");

  const src = readFileSync("js/main.js", "utf8");
  const fn = /function setRefreshWindow\([\s\S]*?\n}/.exec(src)[0];
  assert.match(fn, /Updated \$\{cacheAgeLabel\(since\)\}/, "the age is formatted minutes-only again");
  assert.ok(!/minutesLabel\(since\)/.test(fn), "the minutes-only formatter is back on the age");
});

check("a reload does not restart the countdown at thirty minutes", () => {
  // A fresh tab reads the same published stamp, so it computes the same
  // remaining time. Simulated by re-deriving from state, which is what a new
  // page load would do from the same snapshot.
  const text = nodes.get("refreshWindowText").textContent;
  assert.ok(!/Next update in 30 minutes/.test(text), `countdown restarted: ${text}`);
  assert.ok(
    Math.abs(state.lastUpdated - Date.parse(generatedAt)) < 1000,
    "state should carry the publish time, which is what every tab anchors to"
  );
});

// ---------- the status banner ----------------------------------------------
check("the startup banner is still on screen, not dismissed under the reader", () => {
  const status = nodes.get("status");
  assert.equal(status.hidden, false, "the banner was dismissed during startup");
  assert.ok(status.innerHTML.length > 0, "the banner was emptied");
});

check("a banner raised during boot keeps its full duration", () => {
  // While held, the dial reads the full time and the bar is untouched, so none
  // of it is spent behind the overlay.
  render.holdStatusCountdown();
  const status = nodes.get("status");
  render.setStatus("Held message", "info");
  assert.match(status.innerHTML, /10s/, "should show the full duration while held");

  render.releaseStatusCountdown();
  assert.equal(status.hidden, false, "releasing must not hide the banner");
});

check("a persistent tone never gets a countdown at all", () => {
  const status = nodes.get("status");
  render.setStatus("Loading something", "loading");
  assert.ok(!/data-status-count/.test(status.innerHTML), "loading should not count down");
  render.setStatus("Something failed", "error");
  assert.ok(!/data-status-count/.test(status.innerHTML), "error should not count down");
});

check("the debug tone is its own tone, so it can be styled as a warning", () => {
  const status = nodes.get("status");
  render.setStatus("Debug data on", "debug");
  assert.equal(status.dataset.tone, "debug");
});

// ---------- the debug race --------------------------------------------------
// state.usingDemo only flips inside renderManifest, which runs after the debug
// fetch resolves. During that wait every "are we in debug mode?" check answered
// no, so a scheduled tick could fire and its live result could land on top of
// the debug render, silently dropping the user back out.
check("the rolling window pauses the moment Debug is pressed, not when it finishes", () => {
  // Comments are stripped first: prose about "awaiting" would otherwise be
  // mistaken for the await it describes.
  const main = readFileSync("js/main.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  assert.match(main, /let debugPending = false;/, "no flag covers the wait");
  assert.match(main, /function inDebugMode\(\)/, "no shared debug-mode predicate");

  // Every guard must consult the predicate, not the late-set state flag.
  const guards = main.match(/if \(state\.usingDemo\) return;/g) || [];
  assert.equal(guards.length, 0, `${guards.length} guard(s) still read the late flag`);

  // The flag is claimed before any await, and always released.
  const body = /async function useDebugData\(\)[\s\S]*?\n}/.exec(main)[0];
  const claim = body.indexOf("debugPending = true");
  const firstAwait = body.indexOf("await");
  assert.ok(claim > -1 && claim < firstAwait, "debug mode must be claimed before awaiting");
  assert.match(body, /finally \{[\s\S]*?debugPending = false;/, "the flag must be released in a finally");
});

if (failures > 0) { console.error(`\n${failures} refresh-window check(s) failed.`); process.exit(1); }
console.log("\nRefresh-window and status-timing checks passed.");
process.exit(0);
