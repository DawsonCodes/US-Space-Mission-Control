// Tests for the cache-first manifest cache + freshness model in js/storage.js.
// A controllable localStorage shim is installed BEFORE importing storage so the
// schema/fresh/stale/expired/malformed/quota paths can be exercised.

import assert from "node:assert/strict";

// ---- localStorage shim (with a quota toggle) -----------------------------
const mem = new Map();
let throwOnSet = false;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (throwOnSet) throw new DOMException("QuotaExceededError", "QuotaExceededError");
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const storage = await import("../js/storage.js");
const { MANIFEST_CACHE_SCHEMA, STORAGE_KEYS } = await import("../js/config.js");
const {
  classifyCacheAge,
  cacheAgeLabel,
  getLaunchCache,
  saveLaunchCache,
  isUsableCache,
  clearLaunchCache
} = storage;

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// ---- pure helpers --------------------------------------------------------
check("classifyCacheAge: fresh < 15m, stale < 24h, expired beyond", () => {
  assert.equal(classifyCacheAge(5 * MIN), "fresh");
  assert.equal(classifyCacheAge(14 * MIN), "fresh");
  assert.equal(classifyCacheAge(16 * MIN), "stale");
  assert.equal(classifyCacheAge(23 * HOUR), "stale");
  assert.equal(classifyCacheAge(25 * HOUR), "expired");
  assert.equal(classifyCacheAge(-100), "fresh"); // clock skew -> fresh, not discarded
});

check("cacheAgeLabel produces honest wording", () => {
  assert.equal(cacheAgeLabel(30 * 1000), "just now");
  assert.equal(cacheAgeLabel(1 * MIN), "1 minute ago");
  assert.equal(cacheAgeLabel(42 * MIN), "42 minutes ago");
  assert.equal(cacheAgeLabel(1 * HOUR), "1 hour ago");
  assert.equal(cacheAgeLabel(5 * HOUR), "5 hours ago");
  assert.equal(cacheAgeLabel(2 * 24 * HOUR), "2 days ago");
});

// ---- round-trip + freshness ----------------------------------------------
const sample = { launches: [{ id: "a", net: "2026-08-01T00:00:00Z" }], truncated: false };

check("saveLaunchCache writes a schema-versioned payload; fresh read", () => {
  mem.clear();
  const now = 1_000_000_000;
  assert.equal(saveLaunchCache(sample, now), true);
  const raw = JSON.parse(mem.get(STORAGE_KEYS.manifest));
  assert.equal(raw.schema, MANIFEST_CACHE_SCHEMA);
  const info = getLaunchCache(now + 5 * MIN);
  assert.equal(info.freshness, "fresh");
  assert.ok(isUsableCache(info));
  assert.deepEqual(info.launches, sample.launches);
});

check("stale cache is returned + usable with a positive age", () => {
  mem.clear();
  const now = 2_000_000_000;
  saveLaunchCache(sample, now);
  const info = getLaunchCache(now + 40 * MIN);
  assert.equal(info.freshness, "stale");
  assert.ok(isUsableCache(info));
  assert.equal(info.ageMs, 40 * MIN);
});

check("expired cache is reported expired and NOT usable", () => {
  mem.clear();
  const now = 3_000_000_000;
  saveLaunchCache(sample, now);
  const info = getLaunchCache(now + 30 * HOUR);
  assert.equal(info.freshness, "expired");
  assert.ok(!isUsableCache(info));
});

check("schema mismatch is ignored and removed safely", () => {
  mem.clear();
  mem.set(STORAGE_KEYS.manifest, JSON.stringify({ schema: 999, savedAt: Date.now(), payload: sample }));
  assert.equal(getLaunchCache(), null);
  assert.equal(mem.has(STORAGE_KEYS.manifest), false);
});

check("malformed JSON / payload is ignored and removed safely", () => {
  mem.clear();
  mem.set(STORAGE_KEYS.manifest, "{not valid json");
  assert.equal(getLaunchCache(), null);
  assert.equal(mem.has(STORAGE_KEYS.manifest), false);

  mem.set(STORAGE_KEYS.manifest, JSON.stringify({ schema: MANIFEST_CACHE_SCHEMA, savedAt: 1, payload: { launches: "nope" } }));
  assert.equal(getLaunchCache(), null);
  assert.equal(mem.has(STORAGE_KEYS.manifest), false);
});

check("no cache returns null; isUsableCache(null) is false", () => {
  mem.clear();
  assert.equal(getLaunchCache(), null);
  assert.equal(isUsableCache(null), false);
});

check("a storage quota failure on save is guarded (returns false, no throw)", () => {
  mem.clear();
  throwOnSet = true;
  let result;
  assert.doesNotThrow(() => { result = saveLaunchCache(sample, Date.now()); });
  assert.equal(result, false);
  throwOnSet = false;
});

check("clearLaunchCache removes the entry", () => {
  mem.clear();
  saveLaunchCache(sample, Date.now());
  clearLaunchCache();
  assert.equal(mem.has(STORAGE_KEYS.manifest), false);
});

if (failures > 0) { console.error(`\n${failures} cache test(s) failed.`); process.exit(1); }
console.log("\nAll cache tests passed.");
