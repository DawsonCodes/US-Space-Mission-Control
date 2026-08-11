// The API budget rule.
//
// Published data is shared: the workflow commits it, GitHub Pages serves it, and
// every visitor reads the same file. Reading it is free. Calling Launch Library
// is not, and the budget is per browser, so the API is a fallback that is only
// spent when there is genuinely nothing recent to show.
//
// Concretely: reloading the page, and toggling debug data, must cost zero API
// requests. That was not true before, which is why a reload could hit the rate
// limit before the page had even finished opening.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { loadLaunches } = await import("../js/api.js");
const { API_FALLBACK_MIN_AGE_MS, AUTO_REFRESH_MS, SNAPSHOT_MAX_AGE_MS } =
  await import("../js/config.js");

let apiCalls = 0;
let snapshotBody = null;

const rawLaunch = (id) => ({
  id, name: id, net: "2026-12-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: "m", agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", location: { name: "Cape Canaveral" } }
});

globalThis.fetch = async (url) => {
  const text = String(url);
  if (text.includes(".json")) {
    if (!snapshotBody) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => snapshotBody };
  }
  apiCalls += 1;
  const results = [rawLaunch("live-1")];
  return { ok: true, status: 200, json: async () => ({ count: results.length, results }) };
};

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const reset = (snap) => { mem.clear(); apiCalls = 0; snapshotBody = snap; };

const snapshot = () => ({
  schema: 1,
  generatedAt: new Date().toISOString(),
  truncated: false,
  launches: [{ id: "snap-1", name: "Published", net: "2026-12-01T00:00:00Z" }]
});

// ---------- the normal case ------------------------------------------------
await check("with published data, twenty reloads cost zero API requests", async () => {
  reset(snapshot());
  for (let i = 0; i < 20; i += 1) await loadLaunches({});
  assert.equal(apiCalls, 0, `spent ${apiCalls} API requests on reloads`);
});

await check("published data is what gets rendered, not a per-browser copy", async () => {
  reset(snapshot());
  const result = await loadLaunches({});
  assert.equal(result.source, "snapshot");
  assert.equal(result.launches[0].id, "snap-1");
});

// ---------- the fallback ---------------------------------------------------
await check("without published data, a caller holding recent data spends nothing", async () => {
  reset(null);
  await assert.rejects(
    () => loadLaunches({ allowApi: false }),
    (e) => e.noSnapshot === true,
    "should refuse rather than reach for the API"
  );
  assert.equal(apiCalls, 0);
});

await check("without published data and nothing to show, one request is allowed", async () => {
  reset(null);
  const result = await loadLaunches({ allowApi: true });
  assert.equal(result.source, "live");
  assert.ok(apiCalls > 0);
});

await check("repeated reloads in fallback mode still cost nothing", async () => {
  reset(null);
  await loadLaunches({ allowApi: true }); // the one allowed load
  const afterFirst = apiCalls;
  for (let i = 0; i < 10; i += 1) {
    await loadLaunches({ allowApi: false }).catch(() => {});
  }
  assert.equal(apiCalls, afterFirst, "reloads added requests");
});

// ---------- the thresholds make sense --------------------------------------
await check("the fallback threshold is longer than the refresh window", async () => {
  // Otherwise every automatic tick would spend a request whenever the workflow
  // is down, which is the situation the threshold exists to survive.
  assert.ok(
    API_FALLBACK_MIN_AGE_MS >= AUTO_REFRESH_MS,
    "the fallback would fire on every scheduled check"
  );
});

await check("the fallback threshold caps spending at roughly one request an hour", async () => {
  assert.ok(API_FALLBACK_MIN_AGE_MS >= 60 * 60 * 1000 * 0.5);
  assert.ok(API_FALLBACK_MIN_AGE_MS <= 60 * 60 * 1000 * 2);
});

await check("published data is trusted for longer than it takes to publish", async () => {
  assert.ok(
    SNAPSHOT_MAX_AGE_MS > AUTO_REFRESH_MS,
    "a single late workflow run must not push everyone onto the API"
  );
});

if (failures > 0) { console.error(`\n${failures} API-budget test(s) failed.`); process.exit(1); }
console.log("\nAll API-budget tests passed.");
