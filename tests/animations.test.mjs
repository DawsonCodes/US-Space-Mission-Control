// Animation-layer tests: boot-sequence gating, the segmented countdown values,
// and static guards that every documented animation exists and is neutralised
// under prefers-reduced-motion. (Visual review is still a manual browser step.)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- DOM shim -------------------------------------------------------
function makeEl(id = "") {
  const classes = new Set();
  return {
    id, hidden: false, style: {}, textContent: "", innerHTML: "",
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c), toggle() {}
    },
    _classes: classes,
    removed: false,
    addEventListener() {}, removeEventListener() {},
    remove() { this.removed = true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 40 }),
    querySelector: () => null, querySelectorAll: () => [],
    get offsetWidth() { return 0; }
  };
}

let reduced = false;
let search = "";
const session = new Map();
const nodes = new Map();
const rootEl = makeEl("root");

globalThis.document = {
  documentElement: rootEl,
  getElementById: (id) => nodes.get(id) || null,
  querySelector: (sel) => nodes.get(sel) || null,
  addEventListener() {}, removeEventListener() {}
};
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k)
};
globalThis.window = {
  matchMedia: (q) => ({ matches: reduced && /reduce/.test(q) }),
  setTimeout: () => 0,
  clearTimeout() {},
  get location() { return { search }; }
};

const { setupBoot } = await import("../js/boot.js");

function resetBootDom() {
  nodes.clear();
  rootEl._classes.clear();
  nodes.set("bootScreen", makeEl("bootScreen"));
  nodes.set("bootTitle", makeEl("bootTitle"));
  nodes.set(".hero-copy h1", makeEl("heroTitle"));
}

check("boot runs normally: marks the document as booting and shows the overlay", () => {
  reduced = false; search = ""; session.clear(); resetBootDom();
  setupBoot();
  assert.ok(rootEl.classList.contains("is-booting"), "is-booting applied");
  assert.equal(nodes.get("bootScreen").hidden, false, "overlay shown");
});

check("boot is skipped under prefers-reduced-motion (overlay removed)", () => {
  reduced = true; search = ""; session.clear(); resetBootDom();
  setupBoot();
  assert.ok(!rootEl.classList.contains("is-booting"), "no booting state");
  assert.ok(nodes.get("bootScreen").removed, "overlay removed");
  reduced = false;
});

check("boot is skipped for a ?mission= deep link so shares land on content", () => {
  reduced = false; search = "?mission=ll-123"; session.clear(); resetBootDom();
  setupBoot();
  assert.ok(!rootEl.classList.contains("is-booting"));
  assert.ok(nodes.get("bootScreen").removed);
  search = "";
});

check("boot only plays once per tab (sessionStorage flag)", () => {
  reduced = false; search = ""; session.clear(); resetBootDom();
  setupBoot();
  assert.ok(rootEl.classList.contains("is-booting"), "first visit animates");
  resetBootDom();
  setupBoot();
  assert.ok(!rootEl.classList.contains("is-booting"), "second visit skips");
  assert.ok(nodes.get("bootScreen").removed);
});

check("boot no-ops safely when the markup is missing", () => {
  reduced = false; search = ""; session.clear();
  nodes.clear(); rootEl._classes.clear();
  assert.doesNotThrow(() => setupBoot());
  assert.ok(!rootEl.classList.contains("is-booting"));
});

// ---------- countdown ------------------------------------------------------
const { getCountdownParts, getCountdownText } = await import("../js/utils.js");

check("countdown text now includes seconds", () => {
  const t = new Date(Date.now() + (22 * 86400 + 3 * 3600 + 15 * 60 + 42) * 1000).toISOString();
  assert.match(getCountdownText(t), /^22d 3h 15m \d{1,2}s$/);
});

check("countdown parts split days / hours / minutes / seconds", () => {
  const t = new Date(Date.now() + (2 * 86400 + 5 * 3600 + 9 * 60 + 30) * 1000).toISOString();
  const p = getCountdownParts(t);
  assert.equal(p.passed, false);
  assert.equal(p.days, 2);
  assert.equal(p.hours, 5);
  assert.equal(p.minutes, 9);
  assert.ok(p.seconds >= 28 && p.seconds <= 30, `seconds ~30, got ${p.seconds}`);
});

check("countdown parts handle passed and invalid dates", () => {
  assert.equal(getCountdownParts("nope"), null);
  assert.equal(getCountdownParts(new Date(Date.now() - 60000).toISOString()).passed, true);
});

// ---------- documented catalog --------------------------------------------
const css = readFileSync("styles/components.css", "utf8") + readFileSync("styles/base.css", "utf8");
const doc = readFileSync("ANIMATIONS.md", "utf8");

check("every animation in the catalog is documented in ANIMATIONS.md", () => {
  const ids = [...css.matchAll(/ANIM-(\d{2})/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "catalog ids present in CSS");
  for (const id of new Set(ids)) {
    assert.ok(doc.includes(`ANIM-${id}`), `ANIM-${id} missing from ANIMATIONS.md`);
  }
});

check("key animation hooks exist in CSS", () => {
  for (const sel of [
    "bootShimmer", "bootTitleIn", "sheenSweep", "countdownRoll",
    "countBump", "savePop", "removeCollapse", "refreshSpin", "countdownTick"
  ]) {
    assert.ok(css.includes(sel), `${sel} keyframes/rule missing`);
  }
});

check("reduced motion neutralises the decorative layers", () => {
  const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
  assert.ok(blocks.includes(".btn::after"), "button sheen disabled");
  assert.ok(blocks.includes(".cd-value.is-rolling"), "countdown roll disabled");
  assert.ok(blocks.includes(".boot"), "boot animation disabled");
});

if (failures > 0) { console.error(`\n${failures} animation test(s) failed.`); process.exit(1); }
console.log("\nAll animation tests passed.");
