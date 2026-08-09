// The organization accent edge: one band per organization on a launch, split
// evenly when a mission is shared (a NASA payload on a provider's rocket), and
// always referencing the live :root colour tokens so customization still works.

import assert from "node:assert/strict";

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

const { accentStripe, buildPreviousContent, buildPreviousDetail, buildWeatherHtml } =
  await import("../js/render.js");
const { DEFAULT_ORG_COLORS } = await import("../js/org-theme.js");

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const spacex = { id: "s", name: "Starlink", net: "2026-01-01T00:00:00Z", providerId: 121, providerName: "SpaceX", agencies: [] };
const nasaOnSpacex = { ...spacex, id: "ns", name: "Crew-12", agencies: [{ id: 44, name: "NASA" }] };
const rocketLab = { id: "r", name: "Electron", net: "2026-01-01T00:00:00Z", providerId: 147, providerName: "Rocket Lab", agencies: [] };
const unknown = { id: "u", name: "Mystery", net: "2026-01-01T00:00:00Z", providerId: 999, providerName: "Someone Else", agencies: [] };

// ---------- band construction ---------------------------------------------
check("a single-organization launch gets one solid band", () => {
  const stripe = accentStripe(spacex);
  assert.equal(stripe.bands, 1);
  assert.equal(stripe.primary, "spacex");
  assert.match(stripe.style, /--accent-1:var\(--org-spacex\)/);
  assert.ok(!stripe.style.includes("--accent-2"));
});

check("a shared NASA-on-provider mission splits into two bands", () => {
  const stripe = accentStripe(nasaOnSpacex);
  assert.equal(stripe.bands, 2);
  assert.match(stripe.style, /--accent-1:var\(--org-spacex\)/);
  assert.match(stripe.style, /--accent-2:var\(--org-nasa\)/);
});

check("the provider leads the stripe, NASA follows", () => {
  // Keeps the primary accent the same colour it was before the split existed.
  assert.equal(accentStripe(nasaOnSpacex).primary, "spacex");
  assert.equal(accentStripe({ ...rocketLab, agencies: [{ id: 44, name: "NASA" }] }).primary, "rocket-lab");
});

check("a launch matching no tracked organization gets no stripe", () => {
  const stripe = accentStripe(unknown);
  assert.equal(stripe.bands, 0);
  assert.equal(stripe.style, "");
});

check("bands reference CSS tokens, never baked-in hex values", () => {
  const style = accentStripe(nasaOnSpacex).style;
  for (const hex of Object.values(DEFAULT_ORG_COLORS)) {
    assert.ok(!style.includes(hex), `stripe hard-coded ${hex}; customization would not apply`);
  }
});

// ---------- markup ---------------------------------------------------------
check("a previous-launch row carries the band count for the stylesheet", () => {
  const html = buildPreviousContent([{ ...nasaOnSpacex, statusId: 3, statusName: "Launch Successful" }]);
  assert.match(html, /data-accent="spacex"/);
  assert.match(html, /data-accent-bands="2"/);
  assert.match(html, /--accent-2:var\(--org-nasa\)/);
});

check("a single-provider row is marked as one band, not two", () => {
  const html = buildPreviousContent([{ ...rocketLab, statusId: 3, statusName: "Launch Successful" }]);
  assert.match(html, /data-accent-bands="1"/);
});

// ---------- previous-launch detail view ------------------------------------
const flown = {
  ...nasaOnSpacex,
  statusId: 4,
  statusName: "Launch Failure",
  failReason: "Upper stage shut down early.",
  rocket: "Falcon 9",
  location: "Cape Canaveral",
  padName: "SLC-40",
  webcast: "https://youtu.be/abc"
};

check("every previous row offers a details action", () => {
  const html = buildPreviousContent([flown]);
  assert.match(html, /data-previous-id="ns"/);
  assert.match(html, /View details/);
});

check("the detail view repeats the outcome, cause and a way back", () => {
  const html = buildPreviousDetail(flown);
  assert.match(html, /data-previous-back/);
  assert.match(html, /Failure/);
  assert.match(html, /What went wrong/);
  assert.match(html, /Upper stage shut down early/);
  assert.match(html, /Falcon 9/);
});

check("the detail view mounts a recorded-weather slot in its loading state", () => {
  const html = buildPreviousDetail(flown);
  assert.match(html, /data-previous-weather/);
  assert.match(html, /Weather recorded at launch/);
  assert.match(html, /Loading recorded conditions/);
});

check("stored weather renders immediately without a loading flash", () => {
  const html = buildPreviousDetail(flown, {
    weather: { status: "ok", data: { temperature: 24, weatherCode: 0, precipitationProbability: 5, units: {} } }
  });
  assert.ok(!/Loading recorded conditions/.test(html));
  assert.match(html, /Clear sky/);
  assert.match(html, /75°F \/ 24°C/);
});

check("an unsafe webcast is not linked from the detail view", () => {
  const html = buildPreviousDetail({ ...flown, webcast: "javascript:alert(1)" });
  assert.ok(!/javascript:/.test(html));
  assert.match(html, /No video available/);
});

check("a missing launch degrades to a message plus the back action", () => {
  const html = buildPreviousDetail(null);
  assert.match(html, /Launch not found/);
  assert.match(html, /data-previous-back/);
});

// ---------- recorded-weather wording ---------------------------------------
check("recorded weather is never presented as a forecast", () => {
  const html = buildWeatherHtml({ status: "ok", data: { temperature: 10, weatherCode: 3, units: {} } }, { recorded: true });
  assert.match(html, /Weather recorded at launch/);
  assert.ok(!/launch forecast/.test(html));
});

check("a launch older than the archive says so instead of guessing", () => {
  const html = buildWeatherHtml({ status: "beyond-archive" }, { recorded: true });
  assert.match(html, /No recorded weather is available this far back/);
});

check("a recorded-weather failure is stated, not silently blank", () => {
  const html = buildWeatherHtml({ status: "error" }, { recorded: true });
  assert.match(html, /Recorded conditions are unavailable/);
});

check("the forecast wording is untouched by the recorded mode", () => {
  const html = buildWeatherHtml({ status: "loading" });
  assert.match(html, /Local weather outlook/);
  assert.match(html, /Loading local weather/);
});

if (failures > 0) { console.error(`\n${failures} accent/detail test(s) failed.`); process.exit(1); }
console.log("\nAll accent + previous-detail tests passed.");
