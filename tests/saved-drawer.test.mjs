// The redesigned saved-missions drawer: soonest first, flown launches sunk to
// the bottom and labelled, an accent edge per mission, and a remove control
// that still speaks the same data-favorite-id contract main.js listens for.

import assert from "node:assert/strict";

function makeEl() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    hidden: false, value: "", textContent: "", innerHTML: "", tabIndex: 0, disabled: false,
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
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0 };

const { renderDrawer, els } = await import("../js/render.js");
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

const mission = (id, name, net, extra = {}) => ({
  id, name, net, providerId: 121, providerName: "SpaceX",
  location: "Cape Canaveral", agencies: [], ...extra
});

const draw = (favorites) => {
  state.favorites = favorites;
  renderDrawer();
  return els.drawerList.innerHTML;
};

check("an empty drawer explains how missions get here", () => {
  const html = draw([]);
  assert.match(html, /Nothing saved yet/);
  assert.match(html, /saved-empty/);
  assert.ok(!/saved-card/.test(html));
});

check("saved missions are listed soonest first, not in save order", () => {
  const html = draw([
    mission("late", "Later mission", inDays(30)),
    mission("soon", "Sooner mission", inDays(2))
  ]);
  assert.ok(html.indexOf("Sooner mission") < html.indexOf("Later mission"));
});

check("a mission that already flew sinks to the bottom and is labelled", () => {
  const html = draw([
    mission("past", "Flown mission", inDays(-5)),
    mission("future", "Upcoming mission", inDays(4))
  ]);
  assert.ok(html.indexOf("Upcoming mission") < html.indexOf("Flown mission"));
  assert.match(html, /Already flown/);
  assert.match(html, /saved-card is-past/);
});

check("the summary counts what is still ahead", () => {
  const html = draw([
    mission("a", "A", inDays(-1)),
    mission("b", "B", inDays(3)),
    mission("c", "C", inDays(9))
  ]);
  assert.match(html, /3 saved/);
  assert.match(html, /2 still ahead/);
});

check("each card carries its organization accent edge", () => {
  const html = draw([mission("x", "Crew flight", inDays(6), { agencies: [{ id: 44, name: "NASA" }] })]);
  assert.match(html, /data-accent="spacex"/);
  assert.match(html, /data-accent-bands="2"/);
});

check("remove still uses the data-favorite-id contract main.js listens for", () => {
  const html = draw([mission("keep", "Keep me", inDays(8))]);
  assert.match(html, /data-favorite-id="keep"/);
  assert.match(html, /saved-remove/);
  assert.match(html, /aria-label="Remove Keep me from saved"/);
});

check("details still open from the drawer", () => {
  const html = draw([mission("d", "Detailed", inDays(8))]);
  assert.match(html, /data-details-id="d"/);
});

check("an upcoming mission shows a live countdown, a flown one does not", () => {
  assert.match(draw([mission("f", "Future", inDays(8))]), /data-countdown-parts/);
  const past = draw([mission("p", "Past", inDays(-8))]);
  assert.ok(!/data-countdown-parts/.test(past));
});

check("mission names are escaped, not injected", () => {
  const html = draw([mission("evil", '<img src=x onerror="alert(1)">', inDays(3))]);
  assert.ok(!/<img/.test(html));
  assert.match(html, /&lt;img/);
});

check("Clear all is disabled only when there is nothing to clear", () => {
  draw([]);
  assert.equal(els.btnClearFavorites.disabled, true);
  draw([mission("a", "A", inDays(2))]);
  assert.equal(els.btnClearFavorites.disabled, false);
});

check("an unparseable launch time does not drop the mission", () => {
  const html = draw([mission("bad", "Unknown time", "not-a-date")]);
  assert.match(html, /Unknown time/);
  assert.match(html, /1 saved/);
});

if (failures > 0) { console.error(`\n${failures} saved-drawer test(s) failed.`); process.exit(1); }
console.log("\nAll saved-drawer tests passed.");
