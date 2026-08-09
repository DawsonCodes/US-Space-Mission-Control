// The Previous launches rolling store: a fixed-size window of completed
// launches that carries recorded weather forward, evicts the oldest entry when
// a newer launch arrives, and never grows past the limit.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const {
  mergePreviousLaunches,
  readPreviousStore,
  writePreviousStore,
  setRecordedWeather
} = await import("../js/previous-store.js");
const { PREVIOUS_LIMIT, PREVIOUS_TTL_MS, STORAGE_KEYS, RECORDED_WEATHER_DAYS } =
  await import("../js/config.js");

let failures = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`ok  - ${label}`);
  } catch (e) {
    failures++;
    console.error(`FAIL - ${label}: ${e.message}`);
  }
};

// Day N counted back from a fixed reference, so ordering is unambiguous.
const day = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
const launch = (id, n, extra = {}) => ({ id, name: `L${id}`, net: day(n), ...extra });

// ---------- merge semantics ------------------------------------------------
check("the window is newest-first and capped at the limit", () => {
  const incoming = Array.from({ length: PREVIOUS_LIMIT + 8 }, (_, i) => launch(`x${i}`, i + 1));
  const merged = mergePreviousLaunches([], incoming);
  assert.equal(merged.length, PREVIOUS_LIMIT);
  assert.equal(merged[0].id, `x${PREVIOUS_LIMIT + 7}`, "newest first");
  for (let i = 1; i < merged.length; i += 1) {
    assert.ok(new Date(merged[i - 1].net) >= new Date(merged[i].net), "descending by net");
  }
});

check("a newer launch pushes the oldest entry out of the window", () => {
  const stored = Array.from({ length: PREVIOUS_LIMIT }, (_, i) => launch(`s${i}`, i + 1));
  const oldest = mergePreviousLaunches([], stored).at(-1);
  const merged = mergePreviousLaunches(stored, [launch("brand-new", PREVIOUS_LIMIT + 5)]);

  assert.equal(merged.length, PREVIOUS_LIMIT, "the window never grows");
  assert.equal(merged[0].id, "brand-new");
  assert.ok(!merged.some((l) => l.id === oldest.id), "the oldest entry was evicted");
});

check("an evicted launch takes its recorded weather with it", () => {
  const stored = Array.from({ length: PREVIOUS_LIMIT }, (_, i) =>
    launch(`s${i}`, i + 1, { weather: { status: "ok", data: { temperature: i } } })
  );
  const merged = mergePreviousLaunches(stored, [launch("newer", PREVIOUS_LIMIT + 1)]);
  assert.equal(JSON.stringify(merged).includes('"id":"s0"'), false);
  assert.equal(merged.length, PREVIOUS_LIMIT);
});

check("recorded weather survives a refresh of the same launch", () => {
  const stored = [launch("a", 5, { weather: { status: "ok", data: { temperature: 21 } } })];
  const merged = mergePreviousLaunches(stored, [launch("a", 5, { failReason: "engine anomaly" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].weather.data.temperature, 21, "snapshot carried forward");
  assert.equal(merged[0].failReason, "engine anomaly", "fresh feed fields win");
});

check("a revised outcome from the feed overwrites the stored one", () => {
  const stored = [launch("a", 5, { statusId: 1, statusName: "To Be Determined" })];
  const merged = mergePreviousLaunches(stored, [launch("a", 5, { statusId: 4, statusName: "Launch Failure" })]);
  assert.equal(merged[0].statusId, 4);
  assert.equal(merged[0].statusName, "Launch Failure");
});

check("malformed entries are ignored rather than stored", () => {
  const merged = mergePreviousLaunches([null, { name: "no id" }], [undefined, launch("ok", 3)]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "ok");
});

// ---------- persistence ----------------------------------------------------
check("a fresh store round-trips; a stale one is reported as not fresh", () => {
  mem.clear();
  const now = 1_000_000_000;
  writePreviousStore([launch("a", 2), launch("b", 1)], now);

  const fresh = readPreviousStore(now + PREVIOUS_TTL_MS - 1);
  assert.equal(fresh.launches.length, 2);
  assert.equal(fresh.fresh, true);

  const stale = readPreviousStore(now + PREVIOUS_TTL_MS + 1);
  assert.equal(stale.fresh, false);
  assert.equal(stale.launches.length, 2, "stale data is still readable");
});

check("malformed storage reads as empty instead of throwing", () => {
  mem.clear();
  mem.set(STORAGE_KEYS.previous, "{ not json");
  assert.deepEqual(readPreviousStore().launches, []);
  mem.set(STORAGE_KEYS.previous, JSON.stringify({ launches: "nope" }));
  assert.deepEqual(readPreviousStore().launches, []);
});

check("the persisted payload is capped even if handed too many", () => {
  mem.clear();
  writePreviousStore(Array.from({ length: PREVIOUS_LIMIT + 10 }, (_, i) => launch(`z${i}`, i + 1)));
  assert.equal(readPreviousStore().launches.length, PREVIOUS_LIMIT);
});

check("recorded weather is attached to one launch and persisted", () => {
  mem.clear();
  writePreviousStore([launch("a", 2), launch("b", 1)]);
  const next = setRecordedWeather("b", { status: "ok", data: { temperature: 14 } });

  assert.equal(next.find((l) => l.id === "b").weather.data.temperature, 14);
  assert.equal(next.find((l) => l.id === "a").weather, undefined, "only the target changed");
  assert.equal(readPreviousStore().launches.find((l) => l.id === "b").weather.status, "ok");
});

check("attaching weather to an unknown launch is a no-op", () => {
  mem.clear();
  writePreviousStore([launch("a", 2)]);
  const before = mem.get(STORAGE_KEYS.previous);
  setRecordedWeather("ghost", { status: "ok" });
  assert.equal(mem.get(STORAGE_KEYS.previous), before);
});

check("the store key is versioned away from the old session cache", () => {
  assert.match(STORAGE_KEYS.previous, /previous-v2$/);
});

check("the recorded-weather horizon is a real bound, not unlimited", () => {
  assert.ok(RECORDED_WEATHER_DAYS > 0 && RECORDED_WEATHER_DAYS <= 92);
});

if (failures > 0) {
  console.error(`\n${failures} previous-store test(s) failed.`);
  process.exit(1);
}
console.log("\nAll previous-store tests passed.");
