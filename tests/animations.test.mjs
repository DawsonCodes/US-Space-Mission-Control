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
    "countBump", "confettiFly", "removeCollapse", "refreshSpin", "countdownTick"
  ]) {
    assert.ok(css.includes(sel), `${sel} keyframes/rule missing`);
  }
});

check("boot shimmer keeps every glyph painted for the whole sweep", () => {
  // With -webkit-text-fill-color: transparent, any glyph outside the painted
  // background has nothing to draw and disappears. The flat second layer covers
  // the full width so that can never happen.
  const block = css.match(/\.boot-title\.is-shimmering \{[^}]*\}/s);
  assert.ok(block, "shimmer rule present");
  assert.match(block[0], /-webkit-text-fill-color:\s*transparent/);

  const sizes = /background-size:\s*([^;]+);/.exec(block[0]);
  assert.ok(sizes, "background-size present");
  const layers = sizes[1].split(",").map((s) => s.trim());
  assert.equal(layers.length, 2, "expected a glow layer over a flat base layer");
  assert.match(layers[1], /^100%/, "the base layer must span the whole title");

  const images = /background-image:([\s\S]*?);/.exec(block[0]);
  assert.ok(images, "background-image present");
  assert.match(images[1], /linear-gradient\(#[0-9a-f]{6},\s*#[0-9a-f]{6}\)/i, "base layer must be a solid wash");
});

check("the shimmer glow starts fully off the text, not on top of it", () => {
  const block = css.match(/\.boot-title\.is-shimmering \{[^}]*\}/s);
  const frames = css.match(/@keyframes bootShimmer \{[\s\S]*?\n\}/);
  assert.ok(frames, "bootShimmer keyframes present");

  // A repeating image always has a copy over the glyphs, so it can never start
  // clear of them. Non-repeating is what makes an off-text start possible.
  assert.match(block[0], /background-repeat:\s*no-repeat/, "a tiled glow cannot start off-text");

  const glowWidth = Number(/background-size:\s*(-?\d+)%/.exec(block[0])[1]);
  const startRest = Number(/background-position:\s*(-?\d+)%/.exec(block[0])[1]);
  const from = Number(/from\s*\{\s*background-position:\s*(-?\d+)%/.exec(frames[0])[1]);
  const to = Number(/to\s*\{\s*background-position:\s*(-?\d+)%/.exec(frames[0])[1]);

  // For a background narrower than its box, the pixel offset is
  // (100 - width) * position / 100 as a share of the box width. Fully clear of
  // the left edge means that offset is at most -width.
  const offsetShare = (pos) => ((100 - glowWidth) * pos) / 100;

  assert.equal(startRest, from, "the resting position must match the first frame");
  assert.ok(
    offsetShare(from) <= -glowWidth,
    `glow starts at ${offsetShare(from)}% with width ${glowWidth}%, so it is already over the text`
  );
  assert.ok(
    offsetShare(to) >= 100,
    `glow ends at ${offsetShare(to)}%, so it never fully leaves the text`
  );
});

check("boot shows a Loading row with a spinner, then a Loaded confirmation", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /id="bootLoading"/);
  assert.match(html, /class="boot-spinner"/);
  assert.match(html, /id="bootLoadingText"/);
  assert.match(html, /class="boot-check"/);
  assert.match(css, /\.boot-spinner \{/);
  assert.match(css, /\.boot-loading\.is-loaded \.boot-check/);
  const boot = readFileSync("js/boot.js", "utf8");
  assert.match(boot, /textContent = "Loaded"/, "the row confirms the load");
});

check("a head gate hides the page before first paint (no pre-boot flash)", () => {
  const html = readFileSync("index.html", "utf8");
  const head = html.split("</head>")[0];
  assert.match(head, /is-booting/, "gate runs in <head>");
  assert.match(head, /prefers-reduced-motion/, "gate mirrors the skip rules");
  assert.match(head, /us-space-mission-control-booted/);
  assert.match(head, /mission=/, "deep links skip the overlay");
  assert.match(head, /setTimeout/, "gate has a failsafe release");
  assert.match(css, /html\.is-booting \.boot\[hidden\]/, "overlay shows from the gate");
});

check("the boot overlay lets the real space background through", () => {
  const block = css.match(/\n\.boot \{[^}]*\}/s);
  assert.ok(block, ".boot rule present");
  assert.ok(!/linear-gradient\(180deg, var\(--bg-0\)/.test(block[0]), "no opaque slab of its own");
  assert.match(block[0], /transparent/, "vignette lets the starfield show");
});

check("save button uses a separate star element that turns gold when saved", () => {
  assert.match(css, /\.favorite-btn\.is-active \.fav-star \{[^}]*#ffcf5c/s);
  assert.ok(!css.includes("savePop"), "the save button jump was removed");
});

check("confetti escapes the button's clip while bursting", () => {
  assert.match(css, /\.favorite-btn\.is-bursting \{[^}]*overflow:\s*visible/s);
});

check("button sheen parks on the left instead of snapping back", () => {
  const hover = css.match(/animation: sheenSweep[^;]*;/);
  assert.ok(hover, "sheen animation present");
  assert.match(hover[0], /forwards/, "needs fill-mode forwards");
});

check("reduced motion neutralises the decorative layers", () => {
  const blocks = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
  assert.ok(blocks.includes(".btn::after"), "button sheen disabled");
  assert.ok(blocks.includes(".cd-value.is-rolling"), "countdown roll disabled");
  assert.ok(blocks.includes(".boot"), "boot animation disabled");
});

if (failures > 0) { console.error(`\n${failures} animation test(s) failed.`); process.exit(1); }
console.log("\nAll animation tests passed.");
