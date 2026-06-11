// Static responsive-safety audit: confirms the key overflow guards, wrapping
// rules, and responsive structure are present in the markup/CSS. Not a browser
// substitute (manual device testing still required), but it catches regressions
// of the specific fixes shipped in v3.3.1.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const base = readFileSync("styles/base.css", "utf8");
const components = readFileSync("styles/components.css", "utf8");
const layout = readFileSync("styles/layout.css", "utf8");
const responsive = readFileSync("styles/responsive.css", "utf8");
const allCss = base + components + layout + responsive;

let failures = 0;
const check = (label, fn) => { try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); } };

check("viewport meta is correct (width=device-width, initial-scale=1)", () => {
  assert.match(html, /name="viewport"[^>]*width=device-width/);
  assert.match(html, /initial-scale=1/);
});

check("page-level horizontal overflow is guarded (overflow-x: hidden)", () => {
  assert.match(allCss, /overflow-x:\s*hidden/);
});

check("organization selector wraps (no horizontal scroll / clipped pill)", () => {
  // The .org-tabs block must use flex-wrap: wrap and must NOT force overflow-x.
  const orgTabs = components.match(/\.org-tabs\s*\{[^}]*\}/s);
  assert.ok(orgTabs, ".org-tabs rule present");
  assert.match(orgTabs[0], /flex-wrap:\s*wrap/);
  assert.ok(!/overflow-x:\s*auto/.test(orgTabs[0]), "no overflow-x scroll on org tabs");
});

check("responsive grids use minmax(0, …) so children can shrink", () => {
  assert.match(allCss, /minmax\(0,/);
});

check("details modal uses a safe responsive width + viewport-based max height", () => {
  assert.match(components, /\.modal-panel\s*\{[^}]*min\(/s);
  assert.match(components, /\.modal-panel\s*\{[^}]*max-height:[^;]*dvh/s);
});

check("saved drawer width is viewport-bounded (min(… 100vw …))", () => {
  assert.match(components, /\.drawer-panel\s*\{[^}]*min\(/s);
});

check("long text wrapping guards exist (overflow-wrap: anywhere)", () => {
  assert.match(allCss, /overflow-wrap:\s*anywhere/);
});

check("search field has a static accessible label (not animated-only)", () => {
  assert.match(html, /id="keyword"[\s\S]*?aria-label="Search missions"/);
});

check("customize-colors control + modal are present", () => {
  assert.match(html, /id="btnCustomizeColors"/);
  assert.match(html, /id="orgColorsModal"/);
  assert.match(html, /id="orgColorsContent"/);
});

check("footer links wrap", () => {
  assert.match(allCss, /\.footer-links\s*\{[^}]*flex-wrap:\s*wrap/s);
});

check("no leading-slash asset paths in index.html", () => {
  assert.ok(!/\b(?:src|href)\s*=\s*"\/[^/]/.test(html), "no root-absolute asset paths");
});

if (failures > 0) { console.error(`\n${failures} responsive-audit check(s) failed.`); process.exit(1); }
console.log("\nResponsive audit passed.");
