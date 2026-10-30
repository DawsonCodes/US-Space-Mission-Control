// Static checks for the v3.4 charcoal theme, the search/input clipping fix, and
// reduced-motion background behavior. (Real visual review is still a manual
// browser step — see the report.)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = readFileSync("styles/base.css", "utf8");
const components = readFileSync("styles/components.css", "utf8");
const starfield = readFileSync("js/starfield.js", "utf8");

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

check("background tokens moved toward near-black / charcoal", () => {
  assert.match(base, /--bg-0:\s*#0[0-9a-f]{5}/i);
  // The old blue body wash (rgba(115, 182, 255, 0.16)) must be gone.
  assert.ok(!base.includes("rgba(115, 182, 255, 0.16)"), "no heavy blue body radial");
});

check("body still has a layered space gradient (not a flat color)", () => {
  assert.match(base, /body\s*\{[\s\S]*background:[\s\S]*linear-gradient\(180deg,\s*var\(--bg-0\)/);
});

check("starfield glow is neutral gray (no blue/purple wash)", () => {
  assert.ok(!starfield.includes("rgba(115, 182, 255, 0.12)"), "old blue glow removed");
  assert.ok(!starfield.includes("rgba(157, 125, 255, 0.08)"), "old purple glow removed");
  assert.match(starfield, /rgba\(150, 160, 180/, "neutral gray glow present");
});

check("shooting stars still exist but are gated off under reduced motion", () => {
  assert.match(starfield, /spawnShootingStar/);
  assert.match(starfield, /!reducedMotion\s*&&\s*shootingStars\.length\s*<\s*1/, "rare + reduced-motion-gated");
});

check("star twinkle is frozen under reduced motion", () => {
  assert.match(starfield, /reducedMotion\s*\?\s*0\s*:\s*star\.twinkleSpeed/);
});

check("search/input clipping fix: explicit line-height + fixed height on inputs", () => {
  const inputRule = components.match(/input,\s*\nselect\s*\{[\s\S]*?\}/);
  assert.ok(inputRule, "input,select rule present");
  assert.match(inputRule[0], /line-height:\s*1\.4/);
  assert.match(inputRule[0], /height:\s*44px/);
});

check("search input is appearance-normalized so native chrome can't clip text", () => {
  assert.match(components, /input\[type="search"\]\s*\{[\s\S]*appearance:\s*none/);
});

// ---- focus states must not read as "still open" ---------------------------
// Chromium matches :focus-visible on a <select> even for a plain mouse click,
// and focus stays on the control after the native popup closes. A loud ring
// there sat looking like a stuck open state; the loud ring now belongs to the
// JS-driven open class instead.
check("the loud select ring belongs to the open state, not to focus", () => {
  const focusRule = /select:focus-visible \{[^}]*\}/s.exec(components);
  assert.ok(focusRule, "selects still need a visible focus indicator");
  assert.ok(
    !/var\(--focus-ring\)/.test(focusRule[0]),
    "the full-brightness ring is back on plain focus"
  );

  const openRule = /\.select-wrap\.is-open select \{[^}]*\}/s.exec(components);
  assert.ok(openRule, "no open-state ring; the control would never look active");
  assert.match(openRule[0], /var\(--focus-ring\)/);
});

check("selects keep some focus indication, for keyboard users", () => {
  const focusRule = /select:focus-visible \{[^}]*\}/s.exec(components)[0];
  assert.ok(
    /box-shadow|border-color|outline/.test(focusRule),
    "focus must remain visible even though it is quieter"
  );
});

check("a card highlights on keyboard focus, not after a modal closes", () => {
  // Focus is deliberately restored to the Details button inside the card, so
  // plain :focus-within left the card lit with no way to clear it.
  assert.match(components, /\.launch-card:has\(:focus-visible\)/, "no :has-based card focus rule");
  const plain = /\.launch-card:focus-within \{/.test(components);
  if (plain) {
    // Only acceptable inside an @supports fallback for engines without :has.
    assert.match(components, /@supports not selector\(:has\(\*\)\)[\s\S]*?\.launch-card:focus-within/);
  }
});

if (failures > 0) { console.error(`\n${failures} theme test(s) failed.`); process.exit(1); }
console.log("\nAll theme tests passed.");
