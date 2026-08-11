// The snapshot layer: validation of the published file, the age rule that
// decides when to fall back to the API, and the fallback order itself.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { loadLaunches, fetchSnapshot, isSnapshotUsable, snapshotAgeMs } =
  await import("../js/api.js");
const {
  SNAPSHOT_SCHEMA,
  SNAPSHOT_LAUNCHES,
  SNAPSHOT_PREVIOUS,
  SNAPSHOT_MAX_AGE_MS,
  AUTO_REFRESH_MS
} = await import("../js/config.js");

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const launch = (id) => ({ id, name: `Mission ${id}`, net: "2026-11-01T00:00:00Z", agencies: [] });

const snapshot = (overrides = {}) => ({
  schema: SNAPSHOT_SCHEMA,
  generatedAt: new Date().toISOString(),
  truncated: false,
  counts: { published: 2 },
  launches: [launch("a"), launch("b")],
  ...overrides
});

// Serve whatever the test sets up; `apiCalls` records fallbacks to LL2.
let snapshotResponse = null;
let apiCalls = 0;
let apiMode = "ok";

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
    if (snapshotResponse === null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => snapshotResponse };
  }
  apiCalls += 1;
  if (apiMode === "fail") throw new Error("network down");
  const results = [rawLaunch("live-1")];
  return { ok: true, status: 200, json: async () => ({ count: results.length, results }) };
};

const reset = (snap, mode = "ok") => {
  mem.clear();
  apiCalls = 0;
  apiMode = mode;
  snapshotResponse = snap;
};

// ---------- validation -----------------------------------------------------
await check("a well-formed snapshot loads", async () => {
  reset(snapshot());
  const snap = await fetchSnapshot(SNAPSHOT_LAUNCHES);
  assert.equal(snap.launches.length, 2);
  assert.equal(snap.truncated, false);
  assert.ok(Number.isFinite(snap.generatedAt));
});

await check("a snapshot from a different schema version is rejected", async () => {
  reset(snapshot({ schema: SNAPSHOT_SCHEMA + 1 }));
  await assert.rejects(() => fetchSnapshot(SNAPSHOT_LAUNCHES));
});

await check("a snapshot with no usable timestamp is rejected", async () => {
  reset(snapshot({ generatedAt: "whenever" }));
  await assert.rejects(() => fetchSnapshot(SNAPSHOT_LAUNCHES));
});

await check("a snapshot whose launches are not a list is rejected", async () => {
  reset(snapshot({ launches: { nope: true } }));
  await assert.rejects(() => fetchSnapshot(SNAPSHOT_LAUNCHES));
});

await check("entries without an id are dropped rather than rendered", async () => {
  reset(snapshot({ launches: [launch("a"), null, { name: "no id" }] }));
  const snap = await fetchSnapshot(SNAPSHOT_LAUNCHES);
  assert.equal(snap.launches.length, 1);
});

await check("a missing snapshot rejects instead of resolving empty", async () => {
  reset(null);
  await assert.rejects(() => fetchSnapshot(SNAPSHOT_LAUNCHES));
});

// ---------- age rule -------------------------------------------------------
await check("age is measured from the published timestamp", () => {
  const now = Date.UTC(2026, 5, 1, 12, 0, 0);
  const snap = { generatedAt: now - 90 * 60 * 1000 };
  assert.equal(snapshotAgeMs(snap, now), 90 * 60 * 1000);
});

await check("a recent snapshot is usable, an abandoned one is not", () => {
  const now = Date.now();
  assert.equal(isSnapshotUsable({ generatedAt: now - 1000 }, now), true);
  assert.equal(isSnapshotUsable({ generatedAt: now - SNAPSHOT_MAX_AGE_MS + 1000 }, now), true);
  assert.equal(isSnapshotUsable({ generatedAt: now - SNAPSHOT_MAX_AGE_MS - 1000 }, now), false);
  assert.equal(isSnapshotUsable(null, now), false);
});

await check("the staleness bound covers several missed runs, not just one", () => {
  assert.ok(
    SNAPSHOT_MAX_AGE_MS >= AUTO_REFRESH_MS * 3,
    "one late workflow run should not push everyone onto the API"
  );
});

// ---------- fallback order -------------------------------------------------
await check("a usable snapshot is served and the API is never called", async () => {
  reset(snapshot());
  const result = await loadLaunches();
  assert.equal(result.source, "snapshot");
  assert.equal(result.launches.length, 2);
  assert.equal(apiCalls, 0);
});

await check("no snapshot at all falls back to the API", async () => {
  reset(null);
  const result = await loadLaunches();
  assert.equal(result.source, "live");
  assert.ok(apiCalls > 0);
});

await check("an abandoned snapshot prefers fresh API data", async () => {
  reset(snapshot({ generatedAt: new Date(Date.now() - SNAPSHOT_MAX_AGE_MS - 60_000).toISOString() }));
  const result = await loadLaunches();
  assert.equal(result.source, "live");
  assert.ok(apiCalls > 0);
});

await check("an abandoned snapshot is still better than nothing when the API is down", async () => {
  reset(snapshot({ generatedAt: new Date(Date.now() - SNAPSHOT_MAX_AGE_MS - 60_000).toISOString() }), "fail");
  const result = await loadLaunches();
  assert.equal(result.source, "snapshot-stale");
  assert.equal(result.launches.length, 2, "the old list is shown rather than an error");
  assert.ok(result.generatedAt < Date.now(), "its real age is reported, not faked as now");
});

await check("no snapshot and a dead API surfaces the failure", async () => {
  reset(null, "fail");
  await assert.rejects(() => loadLaunches());
});

await check("the snapshot paths are relative, for the Pages project subpath", () => {
  for (const path of [SNAPSHOT_LAUNCHES, SNAPSHOT_PREVIOUS]) {
    assert.ok(!path.startsWith("/"), `${path} must not be root-absolute`);
    assert.ok(!/^https?:/.test(path), `${path} must be same-origin`);
  }
});

if (failures > 0) { console.error(`\n${failures} snapshot test(s) failed.`); process.exit(1); }
console.log("\nAll snapshot tests passed.");
