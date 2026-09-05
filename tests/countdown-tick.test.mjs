// The per-second countdown tick.
//
// Reported bug: the countdown in the details view is sometimes laggy or slow.
// "Sometimes" was the clue. With the default ten cards the tick is cheap; after
// Load more or Show all the page carries one countdown per launch, and the
// published manifest currently holds 224 of them.
//
// Restarting a CSS animation requires the browser to observe the class as
// absent, which is what reading offsetWidth forces. The old tick did that
// inside the loop, interleaving a write and a layout read per cell, so every
// changed cell flushed document layout. The fix reorders the identical work
// into read, write, one flush, write. This suite pins the shape of that: the
// number of forced layouts must not grow with the number of countdowns.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let forcedLayouts = 0;
let selectorLookups = 0;

// A cell in the segmented display. offsetWidth is a getter so reads are counted.
function makeCell(key, text) {
  const classes = new Set();
  return {
    _cd: key,
    textContent: text,
    getAttribute: (name) => (name === "data-cd" ? key : null),
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    get offsetWidth() { forcedLayouts++; return 0; }
  };
}

function makeBox(net, parts) {
  const cells = [
    makeCell("days", String(parts.days)),
    makeCell("hours", parts.hours),
    makeCell("minutes", parts.minutes),
    makeCell("seconds", parts.seconds)
  ];
  return {
    cells,
    getAttribute: (name) => (name === "data-countdown-parts" ? net : null),
    querySelectorAll: (sel) => { selectorLookups++; return sel === "[data-cd]" ? cells : []; },
    querySelector: (sel) => {
      selectorLookups++;
      const m = /\[data-cd="(\w+)"\]/.exec(sel);
      return m ? cells.find((c) => c._cd === m[1]) || null : null;
    },
    get offsetWidth() { forcedLayouts++; return 0; }
  };
}

function makeTextNode(net, text, inDetails = false) {
  const classes = new Set();
  return {
    textContent: text,
    getAttribute: (name) => (name === "data-countdown" ? net : null),
    parentElement: { classList: { contains: (c) => inDetails && c === "details-countdown" } },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    get offsetWidth() { forcedLayouts++; return 0; }
  };
}

// A page carrying the whole published manifest, which is what Show all produces.
const CARD_COUNT = 224;
// Five days plus a minute, so the days cell floors to 5 rather than to 4 a
// moment later.
const NET = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 1000).toISOString();
// Deliberately wrong values, so every cell has something to change to.
const stale = { days: 999, hours: "99", minutes: "99", seconds: "99" };

const boxes = [];
const textNodes = [];
for (let i = 0; i < CARD_COUNT; i++) {
  boxes.push(makeBox(NET, stale));
  textNodes.push(makeTextNode(NET, "stale"));
}
// Plus the hero and the open details modal.
boxes.push(makeBox(NET, stale));
textNodes.push(makeTextNode(NET, "stale", true));

const bodyEl = { get offsetWidth() { forcedLayouts++; return 0; } };

function makeEl() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    focus() {}, scrollIntoView() {}, getContext: () => null, get offsetWidth() { return 0; }
  };
}

const nodes = new Map();
globalThis.document = {
  getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeEl()); return nodes.get(id); },
  querySelector: () => null,
  querySelectorAll: (sel) => {
    selectorLookups++;
    if (sel === "[data-countdown]") return textNodes;
    if (sel === "[data-countdown-parts]") return boxes;
    return [];
  },
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {},
  get body() { return bodyEl; }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, setInterval: () => 0, clearInterval() {} };

const { updateCountdownNodes } = await import("../js/render.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- one tick over a fully expanded page -----------------------------
forcedLayouts = 0;
selectorLookups = 0;
updateCountdownNodes();
const firstTick = { forcedLayouts, selectorLookups };

console.log(`    (one tick over ${CARD_COUNT + 1} countdowns: ${firstTick.forcedLayouts} forced layouts, ${firstTick.selectorLookups} selector lookups)`);

check("a tick forces layout a constant number of times, not once per cell", () => {
  // The old tick read offsetWidth once per changed cell: 226 whole-document
  // layout flushes every second, each one invalidated by the write before it.
  assert.ok(
    firstTick.forcedLayouts <= 2,
    `${firstTick.forcedLayouts} forced layouts for ${CARD_COUNT + 1} countdowns; it must not scale with the page`
  );
});

check("the tick still did the work, it just reordered it", () => {
  const parts = boxes[0].cells;
  assert.notEqual(parts[3].textContent, "99", "the seconds cell was never updated");
  assert.equal(parts[0].textContent, "5", "the days cell should read 5 for a NET five days out");
  assert.ok(parts[3].classList.contains("is-rolling"), "the roll animation no longer replays");
});

check("the details-modal countdown still replays its own tick animation", () => {
  const details = textNodes[textNodes.length - 1];
  assert.notEqual(details.textContent, "stale", "the details countdown was not updated");
  assert.ok(details.classList.contains("is-ticking"), "ANIM-08 replay was dropped");
});

check("a card countdown does not get the details-only animation", () => {
  assert.ok(!textNodes[0].classList.contains("is-ticking"));
});

check("selector lookups are one per box, not one per unit", () => {
  // The old form issued box.querySelector once for each of days/hours/min/sec,
  // about 900 lookups a second on a fully expanded page.
  const boxCount = boxes.length;
  assert.ok(
    firstTick.selectorLookups <= boxCount + 4,
    `${firstTick.selectorLookups} lookups for ${boxCount} boxes; expected about one each`
  );
});

// ---------- a second tick with nothing to change ----------------------------
check("a tick that changes nothing writes nothing and forces no layout", () => {
  forcedLayouts = 0;
  // Re-running immediately: seconds may have rolled, so pin the values first.
  updateCountdownNodes();
  forcedLayouts = 0;
  const before = boxes[0].cells.map((c) => c.textContent);
  updateCountdownNodes();
  const after = boxes[0].cells.map((c) => c.textContent);
  if (before.join() === after.join()) {
    assert.equal(forcedLayouts, 0, "layout was flushed for a tick with no changes");
  }
});

// ---------- the source itself ----------------------------------------------
const src = readFileSync("js/render.js", "utf8");
const fn = /export function updateCountdownNodes\(\)[\s\S]*?\n}/.exec(src)[0];

check("no offsetWidth read sits inside a loop in the tick", () => {
  // Guards the actual regression: a future edit that moves the flush back into
  // the per-cell loop would restore the stall.
  const loops = fn.split(/\n  for \(/).slice(1);
  for (const body of loops) {
    const upToClose = body.split(/\n  \}/)[0];
    assert.ok(
      !/offsetWidth/.test(upToClose),
      "a forced layout is back inside a loop over the countdowns"
    );
  }
});

check("the clock formatter is built once, not on every tick", () => {
  const footer = /export function refreshFooterMeta\(\)[\s\S]*?\n}/.exec(src)[0];
  assert.ok(
    !/new Intl\.DateTimeFormat/.test(footer),
    "an Intl formatter is being constructed on every countdown tick again"
  );
});

if (failures > 0) { console.error(`\n${failures} countdown-tick check(s) failed.`); process.exit(1); }
console.log("\nCountdown-tick checks passed.");
