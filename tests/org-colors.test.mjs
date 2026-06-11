// Tests for js/org-theme.js — organization accent defaults, persistence,
// malformed-storage handling, contrast clamping, and :root application.

import assert from "node:assert/strict";

// Shims (installed before importing the module under test).
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const applied = new Map();
globalThis.document = {
  documentElement: { style: { setProperty: (k, v) => applied.set(k, v) } }
};

const theme = await import("../js/org-theme.js");
const {
  ORG_COLORS_KEY,
  CUSTOMIZABLE_ORGS,
  DEFAULT_ORG_COLORS,
  CURATED_SWATCHES,
  isReadableAccent,
  loadOrgColors,
  getEffectiveOrgColors,
  applyOrgColors,
  setOrgColor,
  resetOrgColors
} = theme;

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

check("every customizable org has a distinct default accent", () => {
  assert.equal(CUSTOMIZABLE_ORGS.length, 6);
  const values = CUSTOMIZABLE_ORGS.map((o) => DEFAULT_ORG_COLORS[o]);
  values.forEach((v) => assert.ok(/^#[0-9a-f]{6}$/i.test(v), `valid hex: ${v}`));
  assert.equal(new Set(values.map((v) => v.toLowerCase())).size, 6, "all distinct");
});

check("the namespaced storage key is correct and isolated", () => {
  assert.equal(ORG_COLORS_KEY, "us-space-mission-control-org-colors");
});

check("isReadableAccent accepts bright hexes and rejects dark/malformed", () => {
  assert.ok(isReadableAccent("#5aa0ff"));
  assert.ok(isReadableAccent("#ffcf5c"));
  assert.ok(!isReadableAccent("#000000"));
  assert.ok(!isReadableAccent("#101010"));
  assert.ok(!isReadableAccent("not-a-color"));
  assert.ok(!isReadableAccent("#fff"));
  assert.ok(!isReadableAccent(null));
});

check("curated swatches are all readable accents", () => {
  CURATED_SWATCHES.forEach((s) => assert.ok(isReadableAccent(s), `readable: ${s}`));
});

check("no saved colors → effective equals defaults", () => {
  mem.clear();
  assert.deepEqual(loadOrgColors(), {});
  assert.deepEqual(getEffectiveOrgColors(), DEFAULT_ORG_COLORS);
});

check("malformed stored JSON is ignored gracefully", () => {
  mem.clear();
  mem.set(ORG_COLORS_KEY, "{not json");
  assert.deepEqual(loadOrgColors(), {});
  assert.deepEqual(getEffectiveOrgColors(), DEFAULT_ORG_COLORS);
});

check("stored values are sanitized: unknown orgs + unreadable colors dropped", () => {
  mem.clear();
  mem.set(ORG_COLORS_KEY, JSON.stringify({
    spacex: "#74c0fc",      // valid
    nasa: "#000000",        // too dark -> dropped
    bogus: "#ffffff",       // unknown org -> dropped
    ula: "not-a-color"      // malformed -> dropped
  }));
  const loaded = loadOrgColors();
  assert.deepEqual(loaded, { spacex: "#74c0fc" });
  assert.equal(getEffectiveOrgColors().spacex, "#74c0fc");
  assert.equal(getEffectiveOrgColors().nasa, DEFAULT_ORG_COLORS.nasa);
});

check("setOrgColor persists + accepts only readable values", () => {
  mem.clear();
  assert.equal(setOrgColor("firefly", "#ff8a4c"), true);
  assert.equal(loadOrgColors().firefly, "#ff8a4c");
  assert.equal(setOrgColor("firefly", "#000000"), false, "rejects dark");
  assert.equal(setOrgColor("not-an-org", "#ffffff"), false, "rejects unknown org");
});

check("applyOrgColors writes the :root --org-* custom properties", () => {
  applied.clear();
  mem.clear();
  setOrgColor("spacex", "#74c0fc"); // also triggers applyOrgColors
  applyOrgColors();
  assert.equal(applied.get("--org-spacex"), "#74c0fc");
  assert.equal(applied.get("--org-nasa"), DEFAULT_ORG_COLORS.nasa);
});

check("resetOrgColors clears overrides and restores defaults", () => {
  mem.clear();
  setOrgColor("ula", "#b69bff");
  assert.equal(loadOrgColors().ula, "#b69bff");
  resetOrgColors();
  assert.equal(mem.has(ORG_COLORS_KEY), false);
  assert.deepEqual(getEffectiveOrgColors(), DEFAULT_ORG_COLORS);
});

check("a quota failure on save is guarded (returns false, no throw)", () => {
  mem.clear();
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  let result;
  assert.doesNotThrow(() => { result = setOrgColor("spacex", "#74c0fc"); });
  assert.equal(result, false);
  globalThis.localStorage.setItem = original;
});

if (failures > 0) { console.error(`\n${failures} org-color test(s) failed.`); process.exit(1); }
console.log("\nAll org-color tests passed.");
