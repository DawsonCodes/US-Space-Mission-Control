// Builds the launch snapshots that the dashboard actually reads.
//
// Run by .github/workflows/refresh-data.yml twice an hour. It calls Launch
// Library 2 from a CI runner, normalizes the payload with the same module the
// browser uses, and writes data/launches.json and data/previous.json. Visitors
// then load those static files from their own origin and make no API call at
// all, so no one can be rate limited and everyone sees the same complete list.
//
// Because this runs on a schedule rather than per visitor, it can afford to do
// the job properly: page until the feed is exhausted, and retry a feed that
// fails instead of publishing a partial list.
//
// Plain Node 22, no dependencies, no API key. Run it locally with:
//   node scripts/fetch-data.mjs

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_PROVIDERS,
  API_NASA,
  API_PREVIOUS,
  SNAPSHOT_SCHEMA,
  WORKFLOW_MAX_PAGES,
  WORKFLOW_RETRIES,
  WORKFLOW_RETRY_BASE_MS,
  WORKFLOW_REQUEST_GAP_MS
} from "../js/config.js";
import { simplifyLaunch, dedupeMerge } from "../js/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Overridable so the test harness can point the script at a scratch directory
// and drop the polite delays. The workflow sets none of these.
const OUT_DIR = process.env.USMC_DATA_DIR
  ? resolve(process.env.USMC_DATA_DIR)
  : resolve(ROOT, "data");
const REQUEST_GAP_MS = Number(process.env.USMC_REQUEST_GAP_MS ?? WORKFLOW_REQUEST_GAP_MS);
const RETRY_BASE_MS = Number(process.env.USMC_RETRY_BASE_MS ?? WORKFLOW_RETRY_BASE_MS);

const OUT_LAUNCHES = resolve(OUT_DIR, "launches.json");
const OUT_PREVIOUS = resolve(OUT_DIR, "previous.json");

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function log(message) {
  console.log(`[fetch-data] ${message}`);
}

// One request, with retries. A 429 or a 5xx on a CI runner is worth waiting out;
// publishing a partial list would leave every visitor with it for half an hour.
async function request(url, attempt = 0) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "US-Space-Mission-Control data refresh (github.com/DawsonCodes)" }
    });

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Launch API returned ${response.status}`);
    }
    if (!response.ok) {
      // A 4xx that is not rate limiting means the query itself is wrong, so
      // retrying it would just fail the same way.
      const error = new Error(`Launch API returned ${response.status}`);
      error.fatal = true;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.fatal || attempt >= WORKFLOW_RETRIES) throw error;
    const wait = RETRY_BASE_MS * 2 ** attempt;
    log(`${error.message}. Retrying in ${wait / 1000}s (attempt ${attempt + 1}/${WORKFLOW_RETRIES}).`);
    await sleep(wait);
    return request(url, attempt + 1);
  }
}

// Page a feed until it is exhausted. Bounded so a misreported count cannot loop.
async function fetchAll(url, label) {
  const first = await request(url);
  const total = Number(first?.count) || 0;
  let results = Array.isArray(first?.results) ? first.results : [];

  for (let page = 1; page < WORKFLOW_MAX_PAGES; page += 1) {
    if (results.length === 0 || total <= results.length) break;
    await sleep(REQUEST_GAP_MS);
    const next = await request(`${url}&offset=${results.length}`);
    const batch = Array.isArray(next?.results) ? next.results : [];
    if (batch.length === 0) break;
    results = results.concat(batch);
  }

  const complete = results.length >= total;
  log(`${label}: ${results.length} of ${total} records${complete ? "" : " (truncated)"}`);
  return { results, count: total, complete };
}

// Stable key order, so an unchanged dataset serializes byte-identically and the
// workflow can tell "nothing happened" from "something moved".
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

// Write only when the payload actually differs, ignoring the timestamp. A
// no-op run then leaves the working tree clean and the workflow commits
// nothing, so the repository does not churn 48 times a day.
async function writeSnapshot(path, payload) {
  const body = stableStringify({ ...payload, generatedAt: null });

  let previousBody = null;
  try {
    const existing = JSON.parse(await readFile(path, "utf8"));
    previousBody = stableStringify({ ...existing, generatedAt: null });
  } catch {
    /* no usable previous file */
  }

  if (previousBody === body) {
    log(`${basename(path)}: unchanged, leaving as is`);
    return false;
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  log(`${basename(path)}: written`);
  return true;
}

async function main() {
  const generatedAt = new Date().toISOString();

  // Sequential rather than concurrent: there is no deadline here, and one
  // caller at a time is the polite way to sweep an API that rate limits.
  const providers = await fetchAll(API_PROVIDERS, "providers");
  await sleep(REQUEST_GAP_MS);
  const nasa = await fetchAll(API_NASA, "nasa");

  const launches = dedupeMerge(
    providers.results.map(simplifyLaunch),
    nasa.results.map(simplifyLaunch)
  );

  if (launches.length === 0) {
    // Never publish an empty list over a good one; a bad run should leave the
    // last good snapshot in place.
    throw new Error("Refusing to publish an empty upcoming-launch snapshot");
  }

  await sleep(REQUEST_GAP_MS);
  const previousFeed = await fetchAll(API_PREVIOUS, "previous");
  const previous = previousFeed.results.map(simplifyLaunch);

  const changedLaunches = await writeSnapshot(OUT_LAUNCHES, {
    schema: SNAPSHOT_SCHEMA,
    generatedAt,
    truncated: !providers.complete || !nasa.complete,
    counts: { providers: providers.count, nasa: nasa.count, published: launches.length },
    launches
  });

  const changedPrevious = previous.length
    ? await writeSnapshot(OUT_PREVIOUS, {
        schema: SNAPSHOT_SCHEMA,
        generatedAt,
        truncated: false,
        counts: { published: previous.length },
        launches: previous
      })
    : false;

  log(
    changedLaunches || changedPrevious
      ? "Snapshot updated."
      : "No changes; nothing to publish."
  );
}

main().catch((error) => {
  console.error(`[fetch-data] ${error.message}`);
  process.exit(1);
});
