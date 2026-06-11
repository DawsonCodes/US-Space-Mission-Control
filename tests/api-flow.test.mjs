// Integration: with NO usable cache and a transient first failure, the startup
// performs exactly ONE automatic retry and then stops (never an endless loop).
// Minimal DOM shim; controllable failing fetch; counts fetch rounds.

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
const cache = new Map();
globalThis.document = {
  _els: new Map(),
  getElementById(id) { if (!this._els.has(id)) this._els.set(id, makeEl()); return this._els.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return makeEl(); }, createDocumentFragment() { return makeEl(); },
  addEventListener() {}, get body() { return makeEl(); }
};
globalThis.localStorage = { getItem: (k) => (cache.has(k) ? cache.get(k) : null), setItem: (k, v) => cache.set(k, String(v)), removeItem: (k) => cache.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  setInterval: setInterval.bind(globalThis), clearInterval: clearInterval.bind(globalThis),
  setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
  location: { href: "https://x.dev/app/", search: "", pathname: "/app/", hash: "" }
};
globalThis.history = { pushState() {}, replaceState() {} };

let rounds = 0;
globalThis.fetch = async () => { rounds += 1; throw new Error("startup network failure"); };

await import("../js/main.js");

import assert from "node:assert/strict";
const { state } = await import("../js/state.js");

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

// Let the first (failing) load settle.
await new Promise((r) => setTimeout(r, 120));
const roundsAfterFirst = rounds;
check("first uncached load attempted both feeds and failed (no data)", () => {
  assert.equal(state.launches.length, 0);
  assert.ok(roundsAfterFirst >= 2, `expected >=2 feed calls, got ${roundsAfterFirst}`);
});

// Wait past the retry delay (2500ms) + margin; the single retry runs and fails.
await new Promise((r) => setTimeout(r, 3000));
const roundsAfterRetry = rounds;
check("exactly one automatic retry occurred (second round of feed calls)", () => {
  assert.ok(roundsAfterRetry > roundsAfterFirst, "a retry happened");
  assert.ok(roundsAfterRetry <= roundsAfterFirst * 2 + 1, `not endless: ${roundsAfterRetry}`);
});

// Confirm it then STOPS — no further attempts after another delay.
await new Promise((r) => setTimeout(r, 2000));
check("no further retries after the single retry (loop is bounded)", () => {
  assert.equal(rounds, roundsAfterRetry, `expected no new fetches, got ${rounds} vs ${roundsAfterRetry}`);
});

if (failures > 0) { console.error(`\n${failures} api-flow check(s) failed.`); process.exit(1); }
console.log("\nAPI no-cache retry flow passed.");
process.exit(0);
