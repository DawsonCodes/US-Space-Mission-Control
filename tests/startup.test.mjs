// The startup screen: its spinner, and what the status toast does while it is up.
//
// Two reported bugs. The loading spinner did not spin, because it named an
// animation whose keyframes were deleted along with the Refresh button they
// were written for. And the status toast appeared on top of the startup
// animation with a frozen countdown, because the overlay is see-through and the
// toast lives outside the .shell that .is-booting hides.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- every animation has keyframes -----------------------------------
const stylesheets = ["styles/base.css", "styles/components.css", "styles/layout.css", "styles/responsive.css"];
const css = stylesheets.map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).join("\n");
const keyframes = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
const KEYWORDS = new Set(
  "linear ease ease-in ease-out ease-in-out step-start step-end infinite normal reverse alternate alternate-reverse none forwards backwards both running paused initial inherit unset".split(" ")
);

function animationNames() {
  const names = new Map();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    const value = m[1].replace(/(?:var|cubic-bezier|steps)\([^)]*\)/g, " ");
    for (const part of value.split(",")) {
      for (const tok of part.trim().split(/\s+/)) {
        if (!tok || KEYWORDS.has(tok) || /^[\d.]+(m?s)?$/.test(tok) || tok.startsWith("!")) continue;
        if (/^[a-zA-Z_][\w-]*$/.test(tok)) names.set(tok, (names.get(tok) || 0) + 1);
      }
    }
  }
  return names;
}

check("every animation the stylesheets name has keyframes", () => {
  // The guard that would have caught it. Deleting a control's keyframes is a
  // reasonable cleanup; leaving another rule pointing at the name is a silent
  // failure, because the browser just plays nothing.
  const dangling = [...animationNames().keys()].filter((n) => !keyframes.has(n));
  assert.deepEqual(dangling, [], `animation names with no @keyframes: ${dangling.join(", ")}`);
});

check("the startup spinner owns its keyframes and they rotate", () => {
  const rule = /\.boot-spinner \{[^}]*\}/.exec(css);
  assert.ok(rule, ".boot-spinner rule missing");
  const name = /animation:\s*([\w-]+)/.exec(rule[0])?.[1];
  assert.equal(name, "bootSpin", `the spinner borrows "${name}" again`);
  const frames = /@keyframes bootSpin\s*\{[\s\S]*?\}\s*\}/.exec(css);
  assert.ok(frames, "@keyframes bootSpin missing");
  assert.match(frames[0], /rotate\(360deg\)/, "bootSpin does not rotate");
  assert.match(rule[0], /infinite/, "the spinner stops after one turn");
});

// ---------- the toast during startup ----------------------------------------
function makeStatus() {
  const classes = new Set();
  const el = {
    hidden: true, dataset: {}, innerHTML: "",
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle() {} },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    contains: () => false, get offsetWidth() { return 0; }
  };
  return el;
}
function makeEl() {
  const classes = new Set();
  return {
    dataset: {}, style: { setProperty() {}, removeProperty() {} }, hidden: false, value: "", textContent: "", innerHTML: "",
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle() {}, contains: (c) => classes.has(c) },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
    focus() {}, scrollIntoView() {}, getContext: () => null, get offsetWidth() { return 0; }
  };
}
const status = makeStatus();
const nodes = new Map([["status", status]]);
globalThis.document = {
  getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeEl()); return nodes.get(id); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};
const intervals = [];
globalThis.window = {
  matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0,
  setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval() {},
  setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { setStatus, dismissStatus, holdStatusCountdown, releaseStatusCountdown } = await import("../js/render.js");

check("a message raised while the startup screen is up stays off screen", () => {
  holdStatusCountdown();
  setStatus("310 upcoming launches, updated 7 days ago.", "info");
  assert.equal(status.hidden, true, "the toast is showing over the startup animation");
  assert.match(status.innerHTML, /310 upcoming launches/, "the message itself was lost");
  assert.equal(intervals.length, 0, "its countdown started behind the overlay");
});

check("it appears when the dashboard is revealed, with its full countdown", () => {
  releaseStatusCountdown();
  assert.equal(status.hidden, false, "the held message never appeared");
  assert.equal(intervals.length, 1, "the countdown did not start on reveal");
});

check("a message withdrawn during startup does not appear on reveal", () => {
  dismissStatus();
  holdStatusCountdown();
  setStatus("Loading launches…", "info");
  dismissStatus();
  releaseStatusCountdown();
  assert.equal(status.hidden, true, "a dismissed startup message reappeared");
  assert.equal(status.innerHTML, "", "its markup was left behind");
});

check("a persistent message raised during startup is revealed too", () => {
  // Persistent tones have no countdown, so the old hold ignored them entirely
  // and they were on screen through the whole animation.
  holdStatusCountdown();
  setStatus("Debug data. Automatic updates paused.", "debug");
  assert.equal(status.hidden, true, "a persistent toast showed over the startup animation");
  releaseStatusCountdown();
  assert.equal(status.hidden, false, "the persistent message never appeared");
});

check("outside startup a message shows immediately, as before", () => {
  dismissStatus();
  setStatus("Saved \"Starship | Flight 14\" to your missions.", "success");
  assert.equal(status.hidden, false);
});

check("every way the startup screen ends releases the hold", () => {
  // If one path forgot, a message raised during startup would never appear.
  const boot = readFileSync("js/boot.js", "utf8");
  const finish = /function finish\(\)[\s\S]*?\n  \}/.exec(boot)?.[0] || "";
  assert.match(finish, /announceRevealed\(\)/, "the normal finish does not announce the reveal");
  const skipPath = /if \(shouldSkip\([\s\S]*?return;\s*\}/.exec(boot)?.[0] || "";
  assert.match(skipPath, /announceRevealed\(\)/, "skipping the startup screen does not announce the reveal");
  assert.match(boot, /Absolute failsafe[\s\S]*?finish\)/, "the failsafe no longer ends in finish()");
  const main = readFileSync("js/main.js", "utf8");
  assert.match(main, /onBootRevealed\(releaseStatusCountdown\)/, "nothing releases the hold on reveal");
  assert.match(main, /catch \{[\s\S]{0,240}releaseStatusCountdown\(\)/, "a boot failure leaves the hold engaged");
});

if (failures > 0) { console.error(`\n${failures} startup check(s) failed.`); process.exit(1); }
console.log("\nStartup checks passed.");
