// LL2 caps a request at 100 records, so a feed reporting more matches than it
// returned has to be paged. These tests pin the paging behaviour: one extra
// page is followed, the request count stays bounded, and `truncated` stays
// honest about anything still left behind.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const { fetchLiveLaunches } = await import("../js/api.js");
const { FEED_PAGE_SIZE, FEED_MAX_PAGES, API_PROVIDERS, API_NASA } = await import("../js/config.js");

const raw = (id) => ({
  id,
  name: `Mission ${id}`,
  net: "2026-09-01T00:00:00Z",
  status: { name: "Go for Launch" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: "m", agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", location: { name: "Cape Canaveral" } }
});

// A feed that claims `total` matches but only ever hands back a page at a time.
let providerTotal = 0;
let nasaTotal = 0;
let calls = [];

globalThis.fetch = async (url) => {
  const text = String(url);
  calls.push(text);
  const isNasa = text.includes("mission__agency__ids");
  const total = isNasa ? nasaTotal : providerTotal;
  const offsetMatch = /[?&]offset=(\d+)/.exec(text);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;

  const remaining = Math.max(0, total - offset);
  const size = Math.min(FEED_PAGE_SIZE, remaining);
  const prefix = isNasa ? "n" : "p";
  const results = Array.from({ length: size }, (_, i) => raw(`${prefix}${offset + i}`));
  return { ok: true, json: async () => ({ count: total, results }) };
};

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`ok  - ${label}`);
  } catch (e) {
    failures++;
    console.error(`FAIL - ${label}: ${e.message}`);
  }
};

const reset = (p, n) => {
  mem.clear();
  calls = [];
  providerTotal = p;
  nasaTotal = n;
};

await check("a feed that fits in one page is not paged", async () => {
  reset(40, 5);
  const res = await fetchLiveLaunches();
  assert.equal(res.launches.length, 45);
  assert.equal(res.truncated, false);
  assert.equal(calls.length, 2, "one request per feed");
  assert.ok(!calls.some((c) => c.includes("offset=")));
});

await check("a feed with more than one page follows the next page", async () => {
  reset(150, 3);
  const res = await fetchLiveLaunches();
  assert.equal(res.launches.length, 153);
  assert.equal(res.truncated, false, "everything was retrieved");
  const offsetCalls = calls.filter((c) => c.includes(`offset=${FEED_PAGE_SIZE}`));
  assert.equal(offsetCalls.length, 1);
});

await check("paging is bounded, and the remainder is reported as truncated", async () => {
  reset(500, 0);
  const res = await fetchLiveLaunches();
  assert.equal(res.launches.length, FEED_PAGE_SIZE * FEED_MAX_PAGES);
  assert.equal(res.truncated, true, "more exist than were fetched");
  // Two provider pages plus the single NASA request: still far inside LL2's
  // 15-per-hour budget.
  assert.equal(calls.length, 3);
});

await check("an exactly-full first page does not trigger a wasted second request", async () => {
  reset(FEED_PAGE_SIZE, 0);
  await fetchLiveLaunches();
  assert.ok(!calls.some((c) => c.includes("offset=")));
});

await check("both feeds page independently", async () => {
  reset(120, 130);
  const res = await fetchLiveLaunches();
  assert.equal(res.launches.length, 250);
  assert.equal(calls.length, 4);
});

await check("the offset is appended to an existing query string", async () => {
  reset(150, 150);
  await fetchLiveLaunches();
  for (const call of calls.filter((c) => c.includes("offset="))) {
    assert.match(call, /\?.+&offset=\d+$/, `bad paged URL: ${call}`);
  }
  // Both base feeds already carry query params, so `&offset=` is correct.
  assert.ok(API_PROVIDERS.includes("?"));
  assert.ok(API_NASA.includes("?"));
});

await check("the configured page size matches the LL2 per-request cap", () => {
  assert.equal(FEED_PAGE_SIZE, 100);
  assert.match(API_PROVIDERS, /limit=100/);
  assert.match(API_NASA, /limit=100/);
});

if (failures > 0) {
  console.error(`\n${failures} feed-paging test(s) failed.`);
  process.exit(1);
}
console.log("\nAll feed-paging tests passed.");
