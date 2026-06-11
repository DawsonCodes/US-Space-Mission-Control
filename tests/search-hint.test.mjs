// Tests for js/search-hint.js — typewriter lifecycle + reduced-motion fallback.
// Uses a tiny fake input + document so focus/blur/input handlers can be invoked
// deterministically (no reliance on real timer cadence).

import assert from "node:assert/strict";

const STATIC = "Search missions…";

// ---- fake element + document with controllable state ---------------------
function makeInput() {
  const listeners = {};
  return {
    value: "",
    placeholder: "",
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    fire(type) { (listeners[type] || []).forEach((f) => f({ target: this })); }
  };
}

let reduced = false;
let activeElement = null;
let visibility = "visible";
const docListeners = {};
globalThis.document = {
  get activeElement() { return activeElement; },
  get visibilityState() { return visibility; },
  addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); }
};
globalThis.window = {
  matchMedia: (q) => ({ matches: reduced && /reduce/.test(q) }),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id)
};

const { setupSearchHint } = await import("../js/search-hint.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

check("reduced-motion → static placeholder, no animation", () => {
  reduced = true;
  const input = makeInput();
  const dispose = setupSearchHint(input);
  assert.equal(input.placeholder, STATIC);
  dispose();
  reduced = false;
});

check("empty + unfocused → animation starts (placeholder shows a caret)", () => {
  const input = makeInput();
  activeElement = null;
  const dispose = setupSearchHint(input);
  // start() paints immediately with the blinking caret.
  assert.notEqual(input.placeholder, STATIC);
  assert.ok(input.placeholder.includes("|"), `expected caret, got: ${JSON.stringify(input.placeholder)}`);
  dispose();
});

check("focus stops the animation and shows the static placeholder", () => {
  const input = makeInput();
  const dispose = setupSearchHint(input);
  activeElement = input;
  input.fire("focus");
  assert.equal(input.placeholder, STATIC);
  dispose();
  activeElement = null;
});

check("typing (non-empty value) stops the animation", () => {
  const input = makeInput();
  const dispose = setupSearchHint(input);
  input.value = "starship";
  input.fire("input");
  assert.equal(input.placeholder, STATIC);
  dispose();
});

check("clearing + blurring while empty resumes the animation", () => {
  const input = makeInput();
  activeElement = input;
  const dispose = setupSearchHint(input); // starts? activeElement is input so start() shows static
  // Simulate: focus (stop), then clear + blur.
  input.fire("focus");
  assert.equal(input.placeholder, STATIC);
  input.value = "";
  activeElement = null;
  input.fire("blur");
  assert.ok(input.placeholder.includes("|"), "resumed with caret");
  dispose();
});

check("disposer removes all listeners (no leaked timers/handlers)", () => {
  const input = makeInput();
  const before = Object.values(input.listeners).reduce((n, a) => n + a.length, 0);
  const dispose = setupSearchHint(input);
  assert.ok(Object.values(input.listeners).reduce((n, a) => n + a.length, 0) > before);
  dispose();
  // input listeners removed
  assert.equal(["focus", "blur", "input"].every((t) => (input.listeners[t] || []).length === 0), true);
});

if (failures > 0) { console.error(`\n${failures} search-hint test(s) failed.`); process.exit(1); }
console.log("\nAll search-hint tests passed.");
process.exit(0);
