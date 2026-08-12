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
  assert.match(stripe.style, /--accent-1:var\(--org-nasa\)/);
  assert.match(stripe.style, /--accent-2:var\(--org-spacex\)/);
});

check("NASA leads the stripe, the provider follows", () => {
  // The agency whose payload is flying names the top band.
  assert.equal(accentStripe(nasaOnSpacex).primary, "nasa");
  assert.equal(accentStripe({ ...rocketLab, agencies: [{ id: 44, name: "NASA" }] }).primary, "nasa");
  // A provider-only launch is unaffected.
  assert.equal(accentStripe(spacex).primary, "spacex");
  assert.equal(accentStripe(rocketLab).primary, "rocket-lab");
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
  assert.match(html, /data-accent="nasa"/);
  assert.match(html, /data-accent-bands="2"/);
  assert.match(html, /--accent-1:var\(--org-nasa\)/);
  assert.match(html, /--accent-2:var\(--org-spacex\)/);
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

// ---------- stylesheet contract --------------------------------------------
// The split gradient lives in CSS, so the markup tests above cannot see it.
// This bug shipped once: the solid single-colour rule was written with a class
// plus an attribute, the split rule with a bare attribute, so the solid colour
// out-specified the gradient and every shared mission rendered one colour.
const cssSource = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../styles/components.css", import.meta.url), "utf8")
);
// Comments carry dots and brackets of their own, which would be counted as
// selector weight below.
const css = cssSource.replace(/\/\*[\s\S]*?\*\//g, "");

// Rough specificity for the simple selectors used here: (classes, attributes).
function weight(selector) {
  return (selector.match(/\./g) || []).length + (selector.match(/\[/g) || []).length;
}

function selectorsSettingStripeBackground(pattern) {
  return css
    .split("}")
    .filter((block) => pattern.test(block) && /background:/.test(block))
    .flatMap((block) => block.split("{")[0].split(",").map((s) => s.trim()))
    .filter((s) => s.includes("::before"));
}

check("the split gradient out-specifies the solid single-colour stripe", () => {
  const solid = selectorsSettingStripeBackground(/background:\s*var\(--accent-1/);
  const split = selectorsSettingStripeBackground(/background:\s*linear-gradient\(\s*\n?\s*180deg,\s*\n?\s*var\(--accent-1\)\s+0\s+calc\(50%/);

  assert.ok(solid.length > 0, "no solid stripe rule found");
  assert.ok(split.length > 0, "no split stripe rule found");

  const strongestSolid = Math.max(...solid.map(weight));
  for (const selector of split) {
    assert.ok(
      weight(selector) >= strongestSolid,
      `"${selector}" (${weight(selector)}) is weaker than the solid rule (${strongestSolid}); the split would never render`
    );
  }
});

check("every element type that can carry a stripe can also carry a split one", () => {
  for (const cls of ["launch-card", "previous-item", "saved-card"]) {
    assert.ok(
      cssSource.includes(`.${cls}[data-accent-bands="2"]::before`),
      `${cls} has no two-band rule`
    );
  }
});

check("the stripe bands use hard stops rather than a blend", () => {
  // A gradient without repeated stops fades between colours; the design calls
  // for a clean division at the midpoint.
  assert.match(css, /var\(--accent-1\)\s+0\s+calc\(50% - 1px\)/);
  assert.match(css, /var\(--accent-2\)\s+calc\(50% \+ 1px\)\s+100%/);
});

check("a divider separates the two bands, so neither colour bleeds", () => {
  // NASA's rose is far brighter than any provider colour on this background,
  // so without a hard line between them an exact 50/50 still read as rose
  // owning more than half.
  assert.match(
    css,
    /rgba\(0,\s*0,\s*0,\s*0?\.\d+\)\s+calc\(50% - 1px\)\s+calc\(50% \+ 1px\)/,
    "no divider between the bands"
  );
});

check("a split card does not also tint its whole border with one accent", () => {
  // The hover rule sets border-color from --card-accent, which is accent-1, so
  // the entire border went rose and the split ring was composited on top of it.
  assert.match(
    cssSource,
    /\.launch-card\[data-accent-bands="2"\]:hover,[\s\S]{0,120}\{[\s\S]{0,120}border-color:\s*var\(--line\)/,
    "the base border still takes the first accent on a split card"
  );
});

// ---------- detail imagery -------------------------------------------------
check("both detail views show mission imagery", () => {
  const html = buildPreviousDetail({ ...flown, image: "https://example.com/rocket.jpg" });
  assert.match(html, /details-media/);
  assert.match(html, /example\.com\/rocket\.jpg/);
});

check("a launch with no usable image gets the neutral placeholder, not a broken img", () => {
  const html = buildPreviousDetail({ ...flown, image: "", missionImage: "", rocketImage: "" });
  assert.match(html, /details-media is-empty/);
  assert.ok(!/<img/.test(html.split("details-actions")[0]));
});

check("an unsafe image URL is rejected rather than rendered", () => {
  const html = buildPreviousDetail({ ...flown, image: "javascript:alert(1)", missionImage: "", rocketImage: "" });
  assert.ok(!/javascript:/.test(html));
  assert.match(html, /details-media is-empty/);
});

if (failures > 0) { console.error(`\n${failures} accent/detail test(s) failed.`); process.exit(1); }
console.log("\nAll accent + previous-detail tests passed.");
