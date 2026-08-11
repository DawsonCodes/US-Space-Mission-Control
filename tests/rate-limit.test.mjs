// The fallback path, for when there is no published snapshot: a fresh fork, a
// local checkout, or a workflow that has stopped running. Only that path talks
// to LL2, so it is the only one that can be refused.
//
// LL2 answers 429 once the hourly allowance is gone. Retrying through that just
// burns the next hour too, so the refusal is remembered across reloads, stored
// data keeps being served, and the UI is told how long is left instead of being
// shown a generic failure.

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
const nodes = new Map();
globalThis.document = {
  getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, makeEl()); return nodes.get(id); },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => makeEl(), createDocumentFragment: () => makeEl(),
  addEventListener() {}, get body() { return makeEl(); }
};
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0 };

const { fetchLiveLaunches, fetchPreviousLaunches, rateLimitedUntil, clearRateLimit } =
  await import("../js/api.js");
const { STORAGE_KEYS, RATE_LIMIT_COOLDOWN_MS } = await import("../js/config.js");
const { writePreviousStore } = await import("../js/previous-store.js");
const { buildPreviousContent } = await import("../js/render.js");

const raw = (id) => ({
  id, name: `Mission ${id}`, net: "2026-09-01T00:00:00Z",
  status: { id: 3, name: "Launch Successful" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: "m", agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", location: { name: "Cape Canaveral" } }
});

let mode = "ok";
let requests = 0;
globalThis.fetch = async (url) => {
  // No snapshot published, so every loader falls through to LL2.
  if (String(url).includes(".json")) return { ok: false, status: 404, json: async () => ({}) };
  requests += 1;
  if (mode === "429") return { ok: false, status: 429, json: async () => ({}) };
  if (mode === "500") return { ok: false, status: 500, json: async () => ({}) };
  const results = [raw("a"), raw("b")];
  return { ok: true, status: 200, json: async () => ({ count: results.length, results }) };
};

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const reset = (m) => { mem.clear(); requests = 0; mode = m; };

await check("a 429 is surfaced as a rate limit, not a generic failure", async () => {
  reset("429");
  const error = await fetchLiveLaunches().then(() => null, (e) => e);
  assert.ok(error, "expected a rejection");
  assert.equal(error.rateLimited, true);
  assert.ok(error.until > Date.now(), "carries a retry time the UI can show");
});

await check("the cooldown is remembered, so a reload does not retry immediately", async () => {
  reset("429");
  await fetchLiveLaunches().catch(() => {});
  const after = requests;
  assert.ok(rateLimitedUntil() > Date.now());

  // A second attempt, as if the tab were reopened.
  const error = await fetchLiveLaunches().then(() => null, (e) => e);
  assert.equal(error.rateLimited, true);
  assert.equal(requests, after, "no further request was sent while cooling down");
});

await check("the cooldown is bounded and expires on its own", async () => {
  reset("429");
  await fetchLiveLaunches().catch(() => {});
  const until = rateLimitedUntil();
  assert.ok(until - Date.now() <= RATE_LIMIT_COOLDOWN_MS + 1000);

  mem.set(STORAGE_KEYS.cooldown, String(Date.now() - 1));
  assert.equal(rateLimitedUntil(), 0, "an expired cooldown does not block");
});

await check("a non-429 failure does not start a cooldown", async () => {
  reset("500");
  await fetchLiveLaunches().catch((e) => {
    assert.ok(!e.rateLimited);
  });
  assert.equal(rateLimitedUntil(), 0);
});

await check("clearing the cooldown lets requests through again", async () => {
  reset("429");
  await fetchLiveLaunches().catch(() => {});
  assert.ok(rateLimitedUntil() > Date.now());
  clearRateLimit();
  assert.equal(rateLimitedUntil(), 0);
});

await check("a stored previous window is served instead of an error when a refresh is refused", async () => {
  reset("429");
  writePreviousStore([{ id: "p1", name: "Stored launch", net: "2026-01-01T00:00:00Z" }], Date.now() - 60 * 60 * 1000);

  // The stored window is stale, so a refresh is attempted, refused, and the
  // window is shown anyway rather than replaced with an error.
  const launches = await fetchPreviousLaunches({ force: true });
  assert.equal(launches.length, 1);
  assert.equal(launches[0].id, "p1");
  assert.equal(requests, 1);

  // Now cooling down: a second open must not spend another request.
  const again = await fetchPreviousLaunches({ force: true });
  assert.equal(again[0].id, "p1");
  assert.equal(requests, 1, "no further request was sent while cooling down");
});

await check("with nothing stored, the previous panel reports the rate limit", async () => {
  reset("429");
  const error = await fetchPreviousLaunches({ force: true }).then(() => null, (e) => e);
  assert.ok(error?.rateLimited);
});

await check("the retry button is withheld when retrying cannot help", () => {
  const limited = buildPreviousContent([], { state: "error", message: "Rate limited.", retry: false });
  assert.ok(!/data-previous-retry/.test(limited));
  assert.match(limited, /Rate limited\./);

  const transient = buildPreviousContent([], { state: "error", message: "Busy." });
  assert.match(transient, /data-previous-retry/);
});

await check("an extra page failing does not lose the page already fetched", async () => {
  reset("ok");
  // First call succeeds and reports more than it returned; the offset page 429s.
  let call = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes(".json")) return { ok: false, status: 404, json: async () => ({}) };
    call += 1;
    if (call === 1) {
      const results = [raw("a"), raw("b")];
      return { ok: true, status: 200, json: async () => ({ count: 500, results }) };
    }
    return { ok: false, status: 429, json: async () => ({}) };
  };

  const res = await fetchLiveLaunches();
  assert.ok(res.launches.length >= 2, "the first page survived");
  assert.equal(res.truncated, true, "the shortfall is reported honestly");
});

if (failures > 0) { console.error(`\n${failures} rate-limit test(s) failed.`); process.exit(1); }
console.log("\nAll rate-limit tests passed.");
