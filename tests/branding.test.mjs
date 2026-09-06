// The browser-tab mark and the animated sky.
//
// The favicon was a rocket drawn at emoji scale: four 1.2px stars, a porthole
// and a flame, none of which survive the 16px a browser tab actually renders.
// A favicon has one job at one size, so these checks are about what is left
// when it is scaled down, not about what it looks like at 64px.

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const svg = readFileSync("favicon.svg", "utf8");
const html = readFileSync("index.html", "utf8");
const sky = readFileSync("js/starfield.js", "utf8");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---------- the mark --------------------------------------------------------
check("the favicon is valid, self-contained SVG", () => {
  assert.match(svg, /^<svg[^>]*viewBox="0 0 64 64"/m);
  assert.ok(!/<image|xlink:href|href="http/.test(svg), "the icon must not fetch anything");
  assert.ok(svg.length < 4000, `${svg.length} bytes is too much for a tab icon`);
});

check("it carries an accessible name", () => {
  assert.match(svg, /aria-label="U\.S\. Space Mission Control"/);
  assert.match(svg, /<title>/);
});

check("nothing in it is too small to survive a 16px tab", () => {
  // At 16px one unit of the 64 viewBox is a quarter of a pixel. The old mark
  // had r="1.2" stars, which is 0.3px on screen: invisible.
  const radii = [...svg.matchAll(/\br="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(radii.length > 0, "no circles found");
  for (const r of radii) {
    assert.ok(r >= 1.5, `a circle of r=${r} renders at ${(r / 4).toFixed(2)}px in a tab`);
  }
  const strokes = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  for (const w of strokes) {
    assert.ok(w >= 1.5, `a stroke of ${w} renders at ${(w / 4).toFixed(2)}px in a tab`);
  }
});

check("it leads with one bold shape rather than a scene", () => {
  // The trajectory is the mark. If it ever thins out, the icon stops reading.
  const track = /<path[^>]*stroke-width="([\d.]+)"/.exec(svg);
  assert.ok(track, "the trajectory path is gone");
  assert.ok(Number(track[1]) >= 4, `the trajectory is only ${track[1]} units wide`);
});

check("the page points at it, and at a PNG for iOS", () => {
  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml"/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/apple-touch-icon\.png"/);
  // Relative, because the site lives on a Pages project subpath.
  assert.ok(!/href="\/favicon|href="\/assets/.test(html), "an icon path is root-absolute");
});

check("the iOS icon exists at the size iOS asks for", () => {
  const png = readFileSync("assets/apple-touch-icon.png");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 180, `width ${width}`);
  assert.equal(height, 180, `height ${height}`);
  assert.ok(statSync("assets/apple-touch-icon.png").size < 80_000, "the icon is heavier than the page");
});

// ---------- the sky ---------------------------------------------------------
check("the sky has stars, meteors, comets and asteroids", () => {
  for (const name of ["spawnMeteor", "spawnComet", "spawnAsteroid", "buildStars"]) {
    assert.ok(new RegExp(`function ${name}\\(`).test(sky), `${name} missing`);
  }
});

check("meteors arrive often, comets stay rare", () => {
  const gaps = /const DEFAULTS = \{[\s\S]*?\n\};/.exec(sky)[0];
  const read = (key) => {
    const m = new RegExp(`${key}: \\[([\\d.]+), ([\\d.]+)\\]`).exec(gaps);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };
  const meteor = read("meteorGap");
  const comet = read("cometGap");
  assert.ok(meteor && comet, "spawn gaps not found");
  // The old field allowed one streak at a time roughly every three seconds.
  assert.ok(meteor[1] <= 6, `up to ${meteor[1]}s between meteors is not "more frequent"`);
  assert.ok(comet[0] >= 20, `a comet every ${comet[0]}s stops being an event`);
  assert.ok(comet[0] < comet[1], "comet gap range is inverted");
});

check("the sky stops entirely for a hidden tab", () => {
  assert.match(sky, /visibilitychange/, "a background tab keeps animating");
  assert.match(sky, /function stop\(\)[\s\S]*?cancelAnimationFrame/, "the loop is never cancelled");
});

check("depth comes from layers, not from one flat field of dots", () => {
  const layers = /const LAYERS = \[[\s\S]*?\n\];/.exec(sky);
  assert.ok(layers, "LAYERS missing");
  const parallax = [...layers[0].matchAll(/parallax: ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(parallax.length >= 3, "fewer than three depth layers");
  assert.ok(Math.max(...parallax) >= Math.min(...parallax) * 3, "the layers barely differ");
});

if (failures > 0) { console.error(`\n${failures} branding check(s) failed.`); process.exit(1); }
console.log("\nBranding checks passed.");
