// The Space Devs' development mirror (lldev).
//
// They run it so people can build against something without hammering
// production, and it is not meaningfully rate limited. The trade is that it
// serves a cached dataset which can be days behind, so it backs the Debug data
// switch and nothing else.
//
// Two rules these pin. Mirror data is never cached, because the cache is what
// the real dashboard paints from on the next visit. And the mirror is never an
// automatic fallback: when one of its feeds comes back short it produces a
// NASA-only list, which is exactly what must never appear unasked.

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { fetchDevLaunches, fetchDevPreviousLaunches, loadLaunches } = await import("../js/api.js");
const {
  LL2_BASE,
  LL2_DEV_BASE,
  toDevEndpoint,
  API_PROVIDERS,
  API_NASA,
  API_PREVIOUS,
  STORAGE_KEYS
} = await import("../js/config.js");

const rawLaunch = (id) => ({
  id, name: id, net: "2026-12-01T00:00:00Z", status: { name: "Go for Launch" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: "m", agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", location: { name: "Cape Canaveral" } }
});

let calls = [];
let productionMode = "ok";
let devMode = "ok";

globalThis.fetch = async (url) => {
  const text = String(url);
  calls.push(text);
  if (text.includes(".json")) return { ok: false, status: 404, json: async () => ({}) };

  const isDev = text.includes("lldev.thespacedevs.com");
  const mode = isDev ? devMode : productionMode;
  if (mode === "429") return { ok: false, status: 429, json: async () => ({}) };
  if (mode === "down") throw new Error("network down");

  const results = [rawLaunch(isDev ? "dev-1" : "prod-1")];
  return { ok: true, status: 200, json: async () => ({ count: results.length, results }) };
};

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const reset = (prod = "ok", dev = "ok") => {
  mem.clear();
  calls = [];
  productionMode = prod;
  devMode = dev;
};

// ---------- URL construction ----------------------------------------------
await check("the mirror keeps the path and every query parameter", () => {
  for (const url of [API_PROVIDERS, API_NASA, API_PREVIOUS]) {
    const dev = toDevEndpoint(url);
    assert.equal(dev, url.replace(LL2_BASE, LL2_DEV_BASE));
    assert.ok(dev.startsWith(LL2_DEV_BASE), `not on the mirror: ${dev}`);
    assert.equal(
      dev.slice(LL2_DEV_BASE.length),
      url.slice(LL2_BASE.length),
      "path or query changed"
    );
  }
});

await check("production and the mirror are different hosts, same version", () => {
  assert.ok(LL2_BASE.includes("//ll.thespacedevs.com"));
  assert.ok(LL2_DEV_BASE.includes("//lldev.thespacedevs.com"));
  assert.equal(LL2_BASE.split("/").pop(), LL2_DEV_BASE.split("/").pop(), "API version drifted");
});

// ---------- the debug source ----------------------------------------------
await check("debug data comes from the mirror, never from production", async () => {
  reset();
  const result = await fetchDevLaunches({});
  assert.equal(result.source, "dev");
  assert.equal(result.launches[0].id, "dev-1");
  assert.ok(calls.every((c) => c.includes("lldev.")), `production was called: ${calls.join(", ")}`);
});

await check("mirror data is never written to the launch cache", async () => {
  reset();
  await fetchDevLaunches({});
  assert.equal(mem.has(STORAGE_KEYS.manifest), false, "dated mirror data leaked into the cache");
});

await check("completed launches can also come from the mirror", async () => {
  reset();
  const launches = await fetchDevPreviousLaunches({});
  assert.equal(launches[0].id, "dev-1");
  assert.ok(calls.every((c) => c.includes("lldev.")));
});

await check("a mirror that returns nothing is an error, not an empty dashboard", async () => {
  reset();
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ count: 0, results: [] }) });
  await assert.rejects(() => fetchDevLaunches({}));
  globalThis.fetch = saved;
});

// ---------- never an automatic fallback ------------------------------------
await check("production is preferred while it is answering", async () => {
  reset("ok", "ok");
  const result = await loadLaunches({ allowApi: true });
  assert.equal(result.source, "live");
  assert.equal(result.launches[0].id, "prod-1");
  assert.ok(!calls.some((c) => c.includes("lldev.")), "the mirror was used unnecessarily");
});

await check("the mirror is NOT an automatic fallback for a rate-limited production", async () => {
  // It carries a cached dataset, and when one of its feeds is short it produces
  // exactly the NASA-only list this app must never serve unasked. It is reached
  // only when the Debug data button is pressed.
  reset("429", "ok");
  const error = await loadLaunches({ allowApi: true }).then(() => null, (e) => e);
  assert.ok(error, "expected the rate limit to surface, not a silent mirror swap");
  assert.equal(error.rateLimited, true);
  assert.ok(
    !calls.some((c) => c.includes("lldev.")),
    `the mirror was used without being asked: ${calls.join(", ")}`
  );
});

await check("a failing production never silently downgrades the dashboard", async () => {
  reset("down", "ok");
  await assert.rejects(() => loadLaunches({ allowApi: true }));
  assert.ok(!calls.some((c) => c.includes("lldev.")));
  assert.equal(mem.has(STORAGE_KEYS.manifest), false);
});

await check("the mirror is not reached for when the API was not permitted", async () => {
  reset("ok", "ok");
  await loadLaunches({ allowApi: false }).catch(() => {});
  assert.ok(
    !calls.some((c) => c.includes("thespacedevs.com")),
    `withheld mode still called out: ${calls.join(", ")}`
  );
});

if (failures > 0) { console.error(`\n${failures} dev-endpoint test(s) failed.`); process.exit(1); }
console.log("\nAll dev-endpoint tests passed.");
