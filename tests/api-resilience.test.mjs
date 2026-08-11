// Tests for js/api.js fetchLiveLaunches resilience: a single failing feed yields
// usable partial data (not a total failure); both failing throws; the cache is
// written on (partial) success.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const { fetchLiveLaunches } = await import("../js/api.js");
const { STORAGE_KEYS } = await import("../js/config.js");

const raw = (id, lspId, name) => ({
  id, name, net: "2026-09-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: lspId, name },
  mission: { name, type: "Communications", orbit: { name: "LEO", abbrev: "LEO" }, agencies: [] },
  rocket: { configuration: { full_name: "Rocket", families: [{ name: "Fam" }] } },
  pad: { name: "Pad", latitude: "", longitude: "", location: { name: "Cape Canaveral" } }
});

// Controllable fetch: `mode` decides which feed(s) fail.
let mode = "both-ok";
globalThis.fetch = async (url) => {
  const isNasa = String(url).includes("mission__agency__ids");
  const fail = mode === "both-fail" || (mode === "providers-fail" && !isNasa) || (mode === "nasa-fail" && isNasa);
  if (fail) throw new Error("network down");
  const results = isNasa ? [raw("nasa-1", 44, "NASA Sat")] : [raw("p-1", 121, "Starlink"), raw("p-2", 141, "New Shepard")];
  return { ok: true, json: async () => ({ count: results.length, results }) };
};

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

await check("both feeds OK → full data, partial=false, cache written", async () => {
  mem.clear(); mode = "both-ok";
  const res = await fetchLiveLaunches();
  assert.equal(res.partial, false);
  assert.deepEqual(res.failedFeeds, []);
  assert.equal(res.launches.length, 3);
  assert.ok(mem.has(STORAGE_KEYS.manifest), "cache written");
});

await check("NASA feed fails → provider data still renders, partial=true", async () => {
  mem.clear(); mode = "nasa-fail";
  const res = await fetchLiveLaunches();
  assert.equal(res.partial, true);
  assert.deepEqual(res.failedFeeds, ["nasa"]);
  assert.equal(res.launches.length, 2, "provider launches present");
  // A partial result is never cached. Caching the NASA-only list is what made
  // the dashboard show nothing but NASA on the next visit.
  assert.ok(!mem.has(STORAGE_KEYS.manifest), "a partial result must not be cached");
});

await check("provider feed fails → NASA data still renders, partial=true", async () => {
  mem.clear(); mode = "providers-fail";
  const res = await fetchLiveLaunches();
  assert.equal(res.partial, true);
  assert.deepEqual(res.failedFeeds, ["providers"]);
  assert.equal(res.launches.length, 1, "NASA launch present");
});

await check("a NASA-only result never poisons the cache", async () => {
  // The failure that made the whole dashboard look NASA-only: with the provider
  // feed down, the NASA feed is all that survives. Caching it meant the next
  // visit rendered NASA-only before any request was sent, and it stayed that
  // way until a complete load happened to succeed.
  mem.clear();
  mode = "both-ok";
  await fetchLiveLaunches();
  const complete = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(complete.payload.launches.length, 3);

  mode = "providers-fail";
  const res = await fetchLiveLaunches();
  assert.equal(res.launches.length, 1, "only NASA came back");

  const after = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(after.payload.launches.length, 3, "the complete manifest survived");
  assert.ok(
    after.payload.launches.some((l) => l.id === "p-1"),
    "provider launches are still cached"
  );
});

await check("both feeds fail → throws (caller falls back to cache/demo/error)", async () => {
  mem.clear(); mode = "both-fail";
  await assert.rejects(() => fetchLiveLaunches());
  assert.ok(!mem.has(STORAGE_KEYS.manifest), "nothing cached on total failure");
});

if (failures > 0) { console.error(`\n${failures} api-resilience test(s) failed.`); process.exit(1); }
console.log("\nAll api-resilience tests passed.");
