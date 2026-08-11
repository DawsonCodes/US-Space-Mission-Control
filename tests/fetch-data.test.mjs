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
  const total = isPrevious ? PREVIOUS_TOTAL : isNasa ? 0 : TOTAL;
  const m = /[?&]offset=(\\d+)/.exec(text);
  const offset = m ? Number(m[1]) : 0;
  const size = Math.min(100, Math.max(0, total - offset));
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

if (failures > 0) { console.error(`\n${failures} fetch-data test(s) failed.`); process.exit(1); }
console.log("\nAll fetch-data tests passed.");
