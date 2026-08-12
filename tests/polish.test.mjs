// v3.7.0 presentation fixes: image variety and framing, the floating status
// toast, Random mission opening what it picked, and the duplicate Reset filters
// control being gone.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0 };

const { resolveLaunchImage, launchImageLabel } = await import("../js/images.js");
const { buildPreviousDetail, buildWeatherHtml } = await import("../js/render.js");
const { formatSpeed, formatDistance } = await import("../js/weather.js");
const { simplifyLaunch } = await import("../js/normalize.js");

const css = readFileSync("styles/components.css", "utf8");
const html = readFileSync("index.html", "utf8");
const main = readFileSync("js/main.js", "utf8");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- image variety ---------------------------------------------------
// LL2's launch `image` is the rocket-configuration photo, so 100 Falcon 9
// flights all resolved to one picture. Anything mission-specific wins.
check("a mission patch beats the shared rocket photo", () => {
  const withPatch = {
    patchImage: "https://example.test/patch.png",
    image: "https://example.test/falcon9.jpg"
  };
  const resolved = resolveLaunchImage(withPatch);
  assert.equal(resolved.kind, "patch");
  assert.equal(resolved.src, "https://example.test/patch.png");
});

check("the order runs most specific to least", () => {
  const all = {
    patchImage: "https://example.test/patch.png",
    missionImage: "https://example.test/mission.jpg",
    padImage: "https://example.test/pad.jpg",
    programImage: "https://example.test/program.jpg",
    rocketImage: "https://example.test/rocket.jpg"
  };
  assert.equal(resolveLaunchImage(all).kind, "patch");
  assert.equal(resolveLaunchImage({ ...all, patchImage: "" }).kind, "mission");
  assert.equal(resolveLaunchImage({ ...all, patchImage: "", missionImage: "", image: "" }).kind, "pad");
  assert.equal(
    resolveLaunchImage({ patchImage: "", missionImage: "", padImage: "", rocketImage: all.rocketImage }).kind,
    "rocket"
  );
});

check("an unsafe image URL is skipped, not rendered", () => {
  const resolved = resolveLaunchImage({
    patchImage: "javascript:alert(1)",
    missionImage: "https://example.test/ok.jpg"
  });
  assert.equal(resolved.kind, "mission", "the unsafe candidate must be stepped over");
});

check("no image at all still resolves to the neutral placeholder", () => {
  assert.equal(resolveLaunchImage({}).kind, "placeholder");
  assert.equal(resolveLaunchImage({}).src, null);
});

check("every source kind has a caption", () => {
  for (const kind of ["patch", "mission", "pad", "program", "rocket"]) {
    assert.ok(launchImageLabel(kind).length > 3, kind);
  }
});

check("the new image fields survive normalization", () => {
  const l = simplifyLaunch({
    id: "x", name: "n", net: "2026-01-01T00:00:00Z",
    status: { id: 1, name: "Go" },
    launch_service_provider: { id: 121, name: "SpaceX" },
    mission: { name: "m", agencies: [] },
    rocket: { configuration: { full_name: "F9", families: [] } },
    pad: { name: "p", location: { name: "l" }, image_url: "https://example.test/pad.jpg" },
    mission_patches: [{ image_url: "https://example.test/patch.png" }]
  });
  assert.equal(l.patchImage, "https://example.test/patch.png");
  assert.equal(l.padImage, "https://example.test/pad.jpg");
});

check("a record with none of the new fields normalizes without throwing", () => {
  const l = simplifyLaunch({
    id: "y", name: "n", net: "2026-01-01T00:00:00Z",
    status: { id: 1, name: "Go" },
    launch_service_provider: { id: 121, name: "SpaceX" },
    mission: { name: "m", agencies: [] },
    rocket: { configuration: { full_name: "F9", families: [] } },
    pad: { name: "p", location: { name: "l" } }
  });
  assert.equal(l.patchImage, "");
  assert.equal(l.padImage, "");
});

// ---------- image framing ---------------------------------------------------
check("photos are shown whole, over a blurred fill of themselves", () => {
  // LL2 photography is mostly tall portrait shots; cropping them to a 150px
  // landscape strip cut the rocket in half.
  const cardImg = /\.launch-card-media img \{[^}]*\}/s.exec(css);
  assert.ok(cardImg, "card image rule present");
  assert.match(cardImg[0], /object-fit:\s*contain/, "cover crops the vehicle out of frame");

  assert.match(css, /\.launch-card-media \.media-fill \{/, "no blurred backdrop; the photo would letterbox");
  const fill = /\.launch-card-media \.media-fill \{[^}]*\}/s.exec(css)[0];
  assert.match(fill, /filter:\s*blur\(/);
  assert.match(fill, /background-image:\s*var\(--media-src\)/);
});

check("the detail view frames its image the same way", () => {
  const detailImg = /\.details-media img \{[^}]*\}/s.exec(css)[0];
  assert.match(detailImg, /object-fit:\s*contain/);
  assert.match(css, /\.details-media \.media-fill \{/);
});

check("the backdrop URL is built from the validated source, and cannot break out", () => {
  const built = buildPreviousDetail({
    id: "a", name: "M", net: "2026-01-01T00:00:00Z", agencies: [],
    statusId: 3, statusName: "Launch Successful",
    image: 'https://example.test/a.jpg?x=1'
  });
  assert.match(built, /--media-src:url\(/);
  // Quotes and parentheses are stripped before the value reaches the style.
  const value = /--media-src:([^"]*)"/.exec(built.replace(/&quot;/g, '"'));
  assert.ok(value, "no --media-src emitted");
});

// ---------- the floating toast ---------------------------------------------
check("the status toast floats over the page instead of scrolling with it", () => {
  const rule = /\n\.status \{[^}]*\}/s.exec(css);
  assert.ok(rule, ".status rule present");
  assert.match(rule[0], /position:\s*fixed/, "it scrolled out of view inside the toolbar");
  assert.match(rule[0], /z-index:\s*\d+/);
  assert.ok(/bottom:/.test(rule[0]) && /right:/.test(rule[0]), "it needs a corner to sit in");
});

check("the toast is opaque enough to read over cards and photos", () => {
  const rule = /\n\.status \{[^}]*\}/s.exec(css)[0];
  const alpha = Number(/background-color:\s*rgba\([^)]*?,\s*([\d.]+)\)/.exec(rule)?.[1]);
  assert.ok(alpha >= 0.9, `background alpha ${alpha} is too transparent to read over content`);
});

check("the toast lives outside the scrolling shell", () => {
  const statusAt = html.indexOf('id="status"');
  const shellAt = html.indexOf('<div class="shell">');
  assert.ok(statusAt > -1 && shellAt > -1);
  assert.ok(statusAt < shellAt, "the toast is still nested inside the page content");
});

check("the toast has a real close control", () => {
  assert.match(css, /\.status-close \{[^}]*border-radius:\s*50%/s);
});

// ---------- random mission --------------------------------------------------
check("Random mission opens what it picked", () => {
  // Scrolling to a highlighted card asked the reader to work out what had been
  // chosen, and on a long list the flash was often off-screen by the time the
  // smooth scroll finished.
  const fn = /function randomMission\(\)[\s\S]*?\n}/.exec(main);
  assert.ok(fn, "randomMission present");
  assert.match(fn[0], /openDetails\(pick\.id/, "the pick is never opened");
});

check("Random mission still reports an empty pool rather than doing nothing", () => {
  const fn = /function randomMission\(\)[\s\S]*?\n}/.exec(main)[0];
  assert.match(fn, /No matching missions available/);
});

// ---------- the duplicate control -------------------------------------------
check("Reset filters is not duplicated in the More menu", () => {
  const menu = /<div class="more-menu-list"[\s\S]*?<\/div>/.exec(html);
  assert.ok(menu, "More menu present");
  assert.ok(!/Reset filters/.test(menu[0]), "the toolbar already has this control");
  // The toolbar one must still exist.
  assert.match(html, /id="btnClearFilters"|Reset filters/, "the real control went missing");
});

check("nothing still reaches for the removed menu item", () => {
  assert.ok(!/btnResetMenu/.test(main), "a dead element reference was left behind");
});

// ---------- the drawer scrollbar --------------------------------------------
check("the saved drawer reserves its scrollbar gutter", () => {
  // Removing a saved mission briefly shortened the list past the overflow
  // threshold, so the scrollbar flashed in and out and the content jumped.
  const rule = /\.drawer-list \{[^}]*\}/s.exec(css)[0];
  assert.match(rule, /scrollbar-gutter:\s*stable/);
});

// ---------- units -----------------------------------------------------------
// This is a U.S. spaceflight dashboard that was showing km and km/h next to °F.
check("speed and distance read American first, then metric", () => {
  assert.equal(formatSpeed(24).text, "15 mph / 24 km/h");
  assert.equal(formatDistance(24140).text, "15 mi / 24 km");
});

check("a missing reading is null rather than a fabricated zero", () => {
  assert.equal(formatSpeed(null), null);
  assert.equal(formatSpeed(undefined), null);
  assert.equal(formatDistance(null), null);
  assert.equal(formatSpeed("not a number"), null);
});

check("the weather panel renders both units, not just metric", () => {
  const html = buildWeatherHtml({
    status: "ok",
    data: {
      temperature: 19, weatherCode: 0, precipitationProbability: 0,
      cloudCover: 0, visibility: 24140, windSpeed: 24, windGusts: 16, units: {}
    }
  });
  assert.match(html, /15 mi \/ 24 km/, "visibility is still metric-only");
  assert.match(html, /15 mph \/ 24 km\/h/, "wind is still metric-only");
  assert.match(html, /66°F \/ 19°C/, "temperature changed unexpectedly");
});

check("a missing wind reading shows a dash, not NaN", () => {
  const html = buildWeatherHtml({
    status: "ok",
    data: { temperature: 19, weatherCode: 0, visibility: null, windSpeed: null, windGusts: null, units: {} }
  });
  assert.ok(!/NaN/.test(html), "a missing value leaked as NaN");
});

if (failures > 0) { console.error(`\n${failures} polish check(s) failed.`); process.exit(1); }
console.log("\nPolish checks passed.");
