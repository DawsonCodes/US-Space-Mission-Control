// The workflow's commit gate.
//
// The snapshot system was correct in every other respect and still published
// nothing for a day. The workflow wrote data/launches.json, then asked
// `git diff --quiet -- data/` whether anything had changed. git diff only
// compares TRACKED files, and data/ was brand new and untracked, so the answer
// was always "no changes" and the file was discarded on every single run.
//
// This runs the real gate against real git repositories, because the bug was
// entirely in what git reports, not in any JavaScript.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const check = async (label, fn) => {
  try { await fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

const git = (dir, ...args) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "usmc-gate-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@example.test");
  git(dir, "config", "user.name", "T");
  await writeFile(join(dir, "README.md"), "seed\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "seed");
  return dir;
}

// The gate exactly as the workflow runs it: stage, then ask the index.
function gateSaysChanged(dir) {
  git(dir, "add", "-A", "data/");
  try {
    git(dir, "diff", "--cached", "--quiet", "--", "data/");
    return false;
  } catch {
    return true;
  }
}

// The gate as it was, for contrast.
function oldGateSaysChanged(dir) {
  try {
    git(dir, "diff", "--quiet", "--", "data/");
    return false;
  } catch {
    return true;
  }
}

await check("a brand-new untracked data/ is seen as a change", async () => {
  const dir = await repo();
  await mkdir(join(dir, "data"), { recursive: true });
  await writeFile(join(dir, "data/launches.json"), '{"schema":1}\n');

  assert.equal(
    oldGateSaysChanged(dir),
    false,
    "sanity check: the old gate really did miss this, which is the whole bug"
  );
  assert.equal(gateSaysChanged(dir), true, "the first snapshot would be discarded again");
  await rm(dir, { recursive: true, force: true });
});

await check("an edit to an already-tracked snapshot is seen as a change", async () => {
  const dir = await repo();
  await mkdir(join(dir, "data"), { recursive: true });
  await writeFile(join(dir, "data/launches.json"), '{"a":1}\n');
  git(dir, "add", "-A", "data/");
  git(dir, "commit", "-qm", "first snapshot");

  await writeFile(join(dir, "data/launches.json"), '{"a":2}\n');
  assert.equal(gateSaysChanged(dir), true);
  await rm(dir, { recursive: true, force: true });
});

await check("an unchanged snapshot is not committed", async () => {
  const dir = await repo();
  await mkdir(join(dir, "data"), { recursive: true });
  await writeFile(join(dir, "data/launches.json"), '{"a":1}\n');
  git(dir, "add", "-A", "data/");
  git(dir, "commit", "-qm", "first snapshot");

  // Rewritten byte-identically, which is what a no-op run produces.
  await writeFile(join(dir, "data/launches.json"), '{"a":1}\n');
  assert.equal(gateSaysChanged(dir), false, "the repository would churn on every run");
  await rm(dir, { recursive: true, force: true });
});

await check("a deleted snapshot is seen as a change", async () => {
  const dir = await repo();
  await mkdir(join(dir, "data"), { recursive: true });
  await writeFile(join(dir, "data/launches.json"), '{"a":1}\n');
  git(dir, "add", "-A", "data/");
  git(dir, "commit", "-qm", "first snapshot");

  await rm(join(dir, "data/launches.json"));
  assert.equal(gateSaysChanged(dir), true, "-A is what makes a removal visible");
  await rm(dir, { recursive: true, force: true });
});

// ---------- the workflow file itself ---------------------------------------
await check("the workflow stages before it asks, and asks the index", async () => {
  const yml = await readFile(join(ROOT, ".github/workflows/refresh-data.yml"), "utf8");

  assert.ok(
    !/git diff --quiet -- data\//.test(yml),
    "the unstaged check is back; it cannot see a new file"
  );
  assert.match(yml, /git add -A data\//, "nothing stages the snapshot");
  assert.match(yml, /git diff --cached --quiet -- data\//, "the check must read the index");

  const addAt = yml.indexOf("git add -A data/");
  const checkAt = yml.indexOf("git diff --cached --quiet");
  assert.ok(addAt > -1 && addAt < checkAt, "staging must come before the check");
});

if (failures > 0) { console.error(`\n${failures} publish-gate test(s) failed.`); process.exit(1); }
console.log("\nPublish-gate checks passed.");
