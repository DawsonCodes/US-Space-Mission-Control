// Previous-launches panel: outcome classification (success / partial failure /
// failure), the published failure cause, watch links, and the lazy feed URL.

import assert from "node:assert/strict";

// ---------- DOM shim (render.js caches element refs at import) -------------
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
const els = new Map();
globalThis.document = {
  getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl()); return els.get(id); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0 };

const { launchOutcome, OUTCOME_LABELS, OUTCOME_MEANING, normalizeStatus } = await import("../js/organizations.js");
const { buildPreviousContent } = await import("../js/render.js");
const { simplifyLaunch } = await import("../js/api.js");
const { API_PREVIOUS } = await import("../js/config.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const base = {
  id: "p1", name: "Falcon 9 | Test", net: "2026-01-01T00:00:00Z",
  providerName: "SpaceX", providerId: 121, agencies: [], rocket: "Falcon 9",
  location: "Cape Canaveral", webcast: "", official: "", failReason: ""
};

// ---------- outcome classification ----------------------------------------
check("LL2 status ids map to outcomes (3 success / 7 partial / 4 failure)", () => {
  assert.equal(launchOutcome({ statusId: 3 }), "success");
  assert.equal(launchOutcome({ statusId: 7 }), "partial");
  assert.equal(launchOutcome({ statusId: 4 }), "failure");
});

check("status names are a fallback when the id is missing", () => {
  assert.equal(launchOutcome({ statusName: "Launch Successful" }), "success");
  assert.equal(launchOutcome({ statusName: "Partial Failure" }), "partial");
  assert.equal(launchOutcome({ statusName: "Launch Failure" }), "failure");
});

check("an unknown outcome is never guessed", () => {
  assert.equal(launchOutcome({}), "unknown");
  assert.equal(launchOutcome({ statusName: "" }), "unknown");
  assert.equal(OUTCOME_LABELS.unknown, "Outcome unknown");
});

check("'Partial Failure' is not swallowed by the failure matcher", () => {
  // "Partial Failure" contains "failure" — the partial test must run first.
  assert.equal(normalizeStatus({ statusName: "Partial Failure" }).key, "partial");
  assert.equal(normalizeStatus({ statusName: "Launch Failure" }).key, "failure");
});

check("every outcome has a plain-language meaning", () => {
  for (const key of ["success", "partial", "failure", "unknown"]) {
    assert.ok(OUTCOME_MEANING[key] && OUTCOME_MEANING[key].length > 10, key);
  }
});

// ---------- panel rendering ------------------------------------------------
check("loading and error states render without a list", () => {
  assert.match(buildPreviousContent([], { state: "loading" }), /Loading recent launches/);
  const err = buildPreviousContent([], { state: "error", message: "Boom" });
  assert.match(err, /Boom/);
  assert.match(err, /data-previous-retry/);
});

check("empty result is stated honestly", () => {
  assert.match(buildPreviousContent([]), /No recent launches/);
});

check("a failed launch shows the published cause", () => {
  const html = buildPreviousContent([
    { ...base, statusId: 4, statusName: "Launch Failure", failReason: "Second stage engine anomaly." }
  ]);
  assert.match(html, /Failure/);
  assert.match(html, /What went wrong/);
  assert.match(html, /Second stage engine anomaly/);
});

check("a partial failure is labelled and explained, not called a success", () => {
  const html = buildPreviousContent([
    { ...base, statusId: 7, statusName: "Partial Failure", failReason: "Reached a lower orbit than planned." }
  ]);
  assert.match(html, /Partial failure/);
  assert.match(html, /lower orbit than planned/);
  assert.ok(!/>Success</.test(html));
});

check("a failure with no published cause says so instead of inventing one", () => {
  const html = buildPreviousContent([{ ...base, statusId: 4, statusName: "Launch Failure", failReason: "" }]);
  assert.match(html, /No official cause has been published/);
});

check("a successful launch shows no failure block", () => {
  const html = buildPreviousContent([{ ...base, statusId: 3, statusName: "Launch Successful" }]);
  assert.match(html, /Success/);
  assert.ok(!/What went wrong/.test(html));
});

check("a valid webcast becomes a watch link; missing video is stated", () => {
  const withVid = buildPreviousContent([{ ...base, statusId: 3, webcast: "https://youtu.be/abc" }]);
  assert.match(withVid, /Watch launch/);
  assert.match(withVid, /https:\/\/youtu\.be\/abc/);
  assert.match(withVid, /rel="noopener noreferrer"/);

  const noVid = buildPreviousContent([{ ...base, statusId: 3, webcast: "" }]);
  assert.match(noVid, /No video available/);
});

check("an unsafe webcast URL is rejected, not linked", () => {
  const html = buildPreviousContent([{ ...base, statusId: 3, webcast: "javascript:alert(1)" }]);
  assert.ok(!/javascript:/.test(html));
  assert.match(html, /No video available/);
});

// ---------- feed + normalization ------------------------------------------
check("the previous feed targets the previous endpoint for tracked providers", () => {
  assert.match(API_PREVIOUS, /\/launches\/previous\//);
  assert.match(API_PREVIOUS, /lsp__id=121,141,147,124,265/);
  assert.match(API_PREVIOUS, /ordering=-net/);
  assert.match(API_PREVIOUS, /mode=detailed/);
});

check("the failure cause is read from whichever shape LL2 returns", () => {
  const mk = (extra) => simplifyLaunch({
    id: "x", name: "n", net: "2026-01-01T00:00:00Z",
    status: { id: 4, name: "Launch Failure" },
    launch_service_provider: { id: 121, name: "SpaceX" },
    mission: { name: "m", agencies: [] },
    rocket: { configuration: { full_name: "F9", families: [] } },
    pad: { name: "p", location: { name: "l" } },
    ...extra
  });
  assert.equal(mk({ failreason: "A" }).failReason, "A");
  assert.equal(mk({ fail_reason: "B" }).failReason, "B");
  assert.equal(mk({ failure: { reason: "C" } }).failReason, "C");
  assert.equal(mk({}).failReason, "");
});

check("status id and abbrev survive normalization", () => {
  const l = simplifyLaunch({
    id: "x", name: "n", net: "2026-01-01T00:00:00Z",
    status: { id: 7, name: "Partial Failure", abbrev: "PF" },
    launch_service_provider: { id: 121, name: "SpaceX" },
    mission: { name: "m", agencies: [] },
    rocket: { configuration: { full_name: "F9", families: [] } },
    pad: { name: "p", location: { name: "l" } }
  });
  assert.equal(l.statusId, 7);
  assert.equal(l.statusAbbrev, "PF");
  assert.equal(launchOutcome(l), "partial");
});

if (failures > 0) { console.error(`\n${failures} previous-launch test(s) failed.`); process.exit(1); }
console.log("\nAll previous-launch tests passed.");
