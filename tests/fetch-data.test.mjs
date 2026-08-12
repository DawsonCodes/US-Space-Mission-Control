// The scheduled data workflow (scripts/fetch-data.mjs), run against a stubbed
// Launch Library. This is the piece that spends the API calls on everyone's
// behalf, so it has to page a feed to exhaustion, retry rather than publish a
// partial list, refuse to publish nothing over something, and stay quiet when
// the data has not changed.

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

// Run the real script in a child process with fetch replaced by a stub loaded
// through --import, and with the output directory pointed at a temp checkout.
async function runScript({ total, previousTotal = 3, failFirst = 0, gap = 0 }) {
  const dir = await mkdtemp(join(tmpdir(), "usmc-fetch-"));
  await mkdir(join(dir, "data"), { recursive: true });

  const stub = join(dir, "stub.mjs");
  await writeFile(
    stub,
    `
const TOTAL = ${total};
const PREVIOUS_TOTAL = ${previousTotal};
let failsLeft = ${failFirst};
globalThis.__calls = [];

const record = (id, i) => ({
  id: id + i, name: "Mission " + i, net: "2026-11-0" + ((i % 9) + 1) + "T00:00:00Z",
  status: { id: 3, name: "Launch Successful" },
  launch_service_provider: { id: 121, name: "SpaceX" },
  mission: { name: "m", agencies: [] },
  rocket: { configuration: { full_name: "Falcon 9", families: [] } },
  pad: { name: "Pad", location: { name: "Cape Canaveral" } }
});

globalThis.fetch = async (url) => {
  const text = String(url);
  globalThis.__calls.push(text);
  console.log("CALL " + text);

  if (failsLeft > 0) { failsLeft -= 1; return { ok: false, status: 503, json: async () => ({}) }; }

  const isPrevious = text.includes("/previous/");
  const isNasa = text.includes("mission__agency__ids");
  // LL2 reports every completed launch it knows about in the count field, over
  // a thousand of them, regardless of the limit on the query.
  const total = isPrevious ? 1031 : isNasa ? 0 : TOTAL;
  const m = /[?&]offset=(\\d+)/.exec(text);
  const offset = m ? Number(m[1]) : 0;
  const cap = isPrevious ? PREVIOUS_TOTAL : 100;
  const size = Math.min(cap, Math.max(0, total - offset));
  const prefix = isPrevious ? "prev-" : isNasa ? "nasa-" : "prov-";
  const results = Array.from({ length: size }, (_, i) => record(prefix, offset + i));
  return { ok: true, status: 200, json: async () => ({ count: total, results }) };
};
`,
    "utf8"
  );

  const output = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", `file://${stub}`, join(ROOT, "scripts/fetch-data.mjs")],
      { cwd: dir, env: { ...process.env, USMC_DATA_DIR: join(dir, "data"), USMC_REQUEST_GAP_MS: String(gap), USMC_RETRY_BASE_MS: "10" } }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

  return { dir, ...output, calls: (output.out.match(/^CALL .*/gm) || []).map((l) => l.slice(5)) };
}

const readSnapshot = async (dir, name) =>
  JSON.parse(await readFile(join(dir, "data", name), "utf8"));

await check("a feed larger than one page is paged to exhaustion", async () => {
  const { dir, code, calls } = await runScript({ total: 237 });
  assert.equal(code, 0, "script should succeed");

  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.launches.length, 237, "every upcoming launch is published");
  assert.equal(snap.truncated, false);

  const offsets = calls.filter((c) => c.includes("upcoming") && c.includes("offset="));
  assert.equal(offsets.length, 2, "pages 2 and 3 were fetched");
  await rm(dir, { recursive: true, force: true });
});

await check("the published launches are already normalized for the browser", async () => {
  const { dir } = await runScript({ total: 5 });
  const snap = await readSnapshot(dir, "launches.json");
  const first = snap.launches[0];
  assert.ok(first.id && first.name && first.net, "core fields present");
  assert.equal(first.providerName, "SpaceX", "provider was resolved, not left raw");
  assert.ok(Array.isArray(first.agencies), "agencies normalized to a list");
  assert.equal(first.launch_service_provider, undefined, "raw LL2 shape is not published");
  await rm(dir, { recursive: true, force: true });
});

await check("the snapshot carries a schema and a generation time", async () => {
  const { dir } = await runScript({ total: 4 });
  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.schema, 1);
  assert.ok(Number.isFinite(Date.parse(snap.generatedAt)));
  assert.equal(snap.counts.published, snap.launches.length);
  await rm(dir, { recursive: true, force: true });
});

await check("completed launches are published too", async () => {
  const { dir } = await runScript({ total: 4, previousTotal: 6 });
  const snap = await readSnapshot(dir, "previous.json");
  assert.equal(snap.launches.length, 6);
  await rm(dir, { recursive: true, force: true });
});

await check("a transient failure is retried rather than published as partial", async () => {
  const { dir, code, calls } = await runScript({ total: 4, failFirst: 2 });
  assert.equal(code, 0, "the run recovered");
  assert.ok(calls.length > 3, "the failed requests were retried");
  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.launches.length, 4);
  await rm(dir, { recursive: true, force: true });
});

await check("an empty result never replaces a good snapshot", async () => {
  const { dir } = await runScript({ total: 4 });
  const before = await readFile(join(dir, "data", "launches.json"), "utf8");

  // Second run against a feed that returns nothing at all.
  const empty = await runScript({ total: 0 });
  assert.notEqual(empty.code, 0, "the run should fail rather than publish nothing");
  await rm(empty.dir, { recursive: true, force: true });

  const after = await readFile(join(dir, "data", "launches.json"), "utf8");
  assert.equal(after, before, "the previous good snapshot is untouched");
  await rm(dir, { recursive: true, force: true });
});

await check("an unchanged dataset is not rewritten, so the repo does not churn", async () => {
  const first = await runScript({ total: 12 });
  const original = await readFile(join(first.dir, "data", "launches.json"), "utf8");

  // Re-run in the same directory against the same data.
  const stub = join(first.dir, "stub.mjs");
  const rerun = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", `file://${stub}`, join(ROOT, "scripts/fetch-data.mjs")], {
      cwd: first.dir,
      env: { ...process.env, USMC_DATA_DIR: join(first.dir, "data"), USMC_REQUEST_GAP_MS: "0", USMC_RETRY_BASE_MS: "10" }
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

  assert.equal(rerun.code, 0);
  assert.match(rerun.out, /unchanged|No changes/, "the run reported nothing to publish");
  const after = await readFile(join(first.dir, "data", "launches.json"), "utf8");
  assert.equal(after, original, "the file is byte-identical, so git sees no change");
  await rm(first.dir, { recursive: true, force: true });
});

await check("the run publishes exactly what it spent on the API", async () => {
  const { dir, out } = await runScript({ total: 237, previousTotal: 5 });
  const snap = await readSnapshot(dir, "launches.json");

  assert.ok(snap.apiUsage, "apiUsage missing from the snapshot");
  // 3 provider pages + 1 NASA + 1 previous for this fixture.
  assert.equal(snap.apiUsage.requests, 5, `unexpected request count: ${snap.apiUsage.requests}`);
  assert.equal(snap.apiUsage.byFeed.providers, 3);
  assert.equal(snap.apiUsage.byFeed.nasa, 1);
  assert.equal(snap.apiUsage.byFeed.previous, 1);
  assert.equal(snap.apiUsage.retries, 0);
  assert.match(out, /API requests this run: 5/);
  await rm(dir, { recursive: true, force: true });
});

await check("the completed-launch feed is never paged", async () => {
  // LL2 reports over a thousand completed launches in `count` even though the
  // query asks for twenty. Paging that walked backwards through history we
  // throw away and burnt most of the run budget, which then starved the
  // provider feed and truncated the list everyone actually reads.
  const { dir, out, calls } = await runScript({ total: 237, previousTotal: 20 });
  const previousCalls = calls.filter((c) => c.includes("/previous/"));
  assert.equal(previousCalls.length, 1, `previous feed made ${previousCalls.length} requests`);
  assert.ok(!previousCalls.some((c) => c.includes("offset=")), "the previous feed was paged");

  const snap = await readSnapshot(dir, "previous.json");
  assert.equal(snap.launches.length, 20, "the window we actually keep");
  assert.equal(snap.truncated, false, "taking the head deliberately is not truncation");
  assert.ok(!/previous.*truncated/.test(out), `previous reported as truncated: ${out}`);
  await rm(dir, { recursive: true, force: true });
});

await check("not paging the previous feed leaves the budget for the upcoming one", async () => {
  const { dir } = await runScript({ total: 450, previousTotal: 20 });
  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.truncated, false, "the upcoming list should now fit in budget");
  assert.equal(snap.launches.length, 450, "every upcoming launch is published");
  await rm(dir, { recursive: true, force: true });
});

await check("the real-world upcoming count is published whole", async () => {
  // LL2 currently reports about 220 upcoming launches for the tracked
  // providers. Nothing should be left behind at that size, so the dashboard
  // stops saying a few of the furthest-out ones are missing.
  const { dir } = await runScript({ total: 219, previousTotal: 20 });
  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.launches.length, 219);
  assert.equal(snap.truncated, false, "a complete list must not be flagged as partial");
  await rm(dir, { recursive: true, force: true });
});

await check("retries are counted, because they cost the same allowance", async () => {
  const { dir } = await runScript({ total: 4, failFirst: 2 });
  const snap = await readSnapshot(dir, "launches.json");
  assert.equal(snap.apiUsage.retries, 2, "retried requests must be counted");
  assert.ok(snap.apiUsage.requests > 3);
  await rm(dir, { recursive: true, force: true });
});

await check("a huge feed stops paging rather than blowing the hourly allowance", async () => {
  // 5000 launches would be 50 pages. The run budget stops it well before that
  // and says so, instead of silently spending the next hour's requests.
  const { dir, out } = await runScript({ total: 5000 });
  const snap = await readSnapshot(dir, "launches.json");
  assert.ok(snap.apiUsage.requests <= snap.apiUsage.runBudget, `spent ${snap.apiUsage.requests}`);
  assert.equal(snap.truncated, true, "the shortfall must be reported");
  assert.match(out, /stopped early to stay inside/, "the cap must be logged, not silent");
  await rm(dir, { recursive: true, force: true });
});

await check("the published spend sits inside the hourly allowance", async () => {
  const { dir } = await runScript({ total: 237 });
  const snap = await readSnapshot(dir, "launches.json");
  const perHour = snap.apiUsage.requests * snap.apiUsage.runsPerHour;
  assert.ok(
    perHour <= snap.apiUsage.hourlyBudget,
    `the schedule would spend ${perHour} an hour against a budget of ${snap.apiUsage.hourlyBudget}`
  );
  await rm(dir, { recursive: true, force: true });
});

await check("changing only the request count does not trigger a commit", async () => {
  // apiUsage moves every run by definition. If it counted as a change the repo
  // would churn 48 times a day for nothing.
  const first = await runScript({ total: 12 });
  const original = await readFile(join(first.dir, "data", "launches.json"), "utf8");
  const stub = join(first.dir, "stub.mjs");
  const rerun = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", `file://${stub}`, join(ROOT, "scripts/fetch-data.mjs")], {
      cwd: first.dir,
      env: { ...process.env, USMC_DATA_DIR: join(first.dir, "data"), USMC_REQUEST_GAP_MS: "0", USMC_RETRY_BASE_MS: "10" }
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
  assert.equal(rerun.code, 0);
  assert.equal(await readFile(join(first.dir, "data", "launches.json"), "utf8"), original);
  await rm(first.dir, { recursive: true, force: true });
});

await check("recorded weather is published with the completed launches", async () => {
  const { dir, out } = await runScript({ total: 4, previousTotal: 3 });
  const snap = await readSnapshot(dir, "previous.json");
  assert.ok(snap.launches.every((l) => "weather" in l || l.padLat == null),
    "launches with coordinates should carry a stored reading");
  assert.match(out, /weather: \d+ carried forward, \d+ looked up/);
  await rm(dir, { recursive: true, force: true });
});

await check("a launch already carrying weather is not looked up again", async () => {
  // The point of publishing it: one lookup per launch, ever, for everybody.
  const first = await runScript({ total: 4, previousTotal: 3 });
  const before = await readSnapshot(first.dir, "previous.json");
  const withWeather = before.launches.filter((l) => l.weather).length;

  const stub = join(first.dir, "stub.mjs");
  const rerun = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", `file://${stub}`, join(ROOT, "scripts/fetch-data.mjs")], {
      cwd: first.dir,
      env: { ...process.env, USMC_DATA_DIR: join(first.dir, "data"), USMC_REQUEST_GAP_MS: "0", USMC_RETRY_BASE_MS: "10" }
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

  assert.equal(rerun.code, 0);
  const carried = Number(/weather: (\d+) carried forward/.exec(rerun.out)?.[1]);
  const looked = Number(/carried forward, (\d+) looked up/.exec(rerun.out)?.[1]);
  assert.equal(carried, withWeather, `expected ${withWeather} carried forward, got ${carried}`);
  assert.equal(looked, 0, `looked up ${looked} again instead of reusing them`);
  await rm(first.dir, { recursive: true, force: true });
});

if (failures > 0) { console.error(`\n${failures} fetch-data test(s) failed.`); process.exit(1); }
console.log("\nAll fetch-data tests passed.");
