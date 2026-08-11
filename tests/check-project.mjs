// Architecture + path-safety audit. Runnable in Node with no dependencies.
// Fails (non-zero exit) on: unresolved named imports, leading-slash asset paths,
// a missing root index.html, or any package-manager / dependency / build
// artifact creeping into the repo. Used locally and by GitHub Actions.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

const root = process.cwd();
let problems = 0;
const fail = (msg) => { console.error(`FAIL - ${msg}`); problems += 1; };
const ok = (msg) => console.log(`ok  - ${msg}`);

// ---- 1. Named imports resolve to real exports ----------------------------
function listJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listJs(p));
    else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

function exportsOf(file) {
  const src = readFileSync(file, "utf8");
  const names = new Set();
  let m;
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_]+)/g;
  while ((m = re.exec(src))) names.add(m[1]);
  const re2 = /export\s*\{([^}]+)\}/g;
  while ((m = re2.exec(src))) {
    m[1].split(",").forEach((s) => {
      const n = s.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    });
  }
  return names;
}

const files = [...listJs(join(root, "js")), ...listJs(join(root, "tests"))];
let importIssues = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const re = /import\s*\{([^}]+)\}\s*from\s*["'](\.{1,2}\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const target = resolve(dirname(file), m[2]);
    if (!existsSync(target)) { fail(`${file}: missing import target ${m[2]}`); importIssues++; continue; }
    const exp = exportsOf(target);
    for (const raw of m[1].split(",")) {
      const n = raw.trim().split(/\s+as\s+/)[0].trim();
      if (n && !exp.has(n)) { fail(`${file}: {${n}} not exported by ${m[2]}`); importIssues++; }
    }
  }
}
if (importIssues === 0) ok("all named imports resolve to real exports");

// ---- 2. index.html at repo root, relative asset paths only ---------------
if (!existsSync(join(root, "index.html"))) fail("index.html is not at the repository root");
else {
  ok("index.html is at the repository root");
  const html = readFileSync(join(root, "index.html"), "utf8");
  if (/\b(?:src|href)\s*=\s*"\/[^/]/.test(html)) fail("index.html contains a leading-slash (absolute-root) asset path");
  else ok("no leading-slash asset paths in index.html");
}

// ---- 3. No absolute-root imports/paths in JS or CSS ----------------------
let absIssues = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (/from\s*["']\/[^/]/.test(src)) { fail(`${file}: absolute-root import path`); absIssues++; }
}
for (const css of listJs(join(root, "styles")).length ? [] : []) void css; // styles are .css, skip
if (absIssues === 0) ok("no absolute-root import paths in modules");

// ---- 3b. Config constants are imported before they are used --------------
// A SCREAMING_SNAKE_CASE name that a module references but never imports or
// declares is a ReferenceError waiting to happen. `node --check` does not catch
// it, and a try/catch around the call site can swallow it entirely: that is how
// a missing SNAPSHOT_SCHEMA import once made the whole snapshot path fall
// silently back to the API.
let undefinedConsts = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const known = new Set();
  // import { A, B as C } from "..."
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) known.add(name);
    }
  }
  // import D from "..." / import * as E from "..."
  for (const m of src.matchAll(/import\s+(?:\*\s*as\s+)?(\w+)\s*(?:,|from)/g)) known.add(m[1]);
  // locally declared, including destructured and exported
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) known.add(m[1]);
  for (const m of src.matchAll(/\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(":").pop()?.trim();
      if (name) known.add(name);
    }
  }

  const reported = new Set();
  for (const m of src.matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)) {
    const name = m[1];
    if (known.has(name) || reported.has(name)) continue;
    // A property read (ORG.BLUE_ORIGIN, process.env.FOO) resolves at runtime,
    // and a key in an object literal (FOO: value) is not a reference at all.
    if (src[m.index - 1] === ".") continue;
    if (/^\s*:/.test(src.slice(m.index + name.length))) continue;
    reported.add(name);
    fail(`${file}: uses ${name} but never imports or declares it`);
    undefinedConsts++;
  }
}
if (undefinedConsts === 0) ok("every config constant used is imported or declared");

// ---- 3c. Modules actually evaluate ---------------------------------------
// The check above only catches SCREAMING_SNAKE names. A missing camelCase
// helper is the same failure and slips straight past it, so every module is
// imported for real: a ReferenceError at module scope fails here rather than
// in the browser. Modules that touch the DOM get a minimal shim first.
let evalFailures = 0;
for (const file of files) {
  const rel = file.slice(root.length + 1);
  if (!rel.startsWith("js/")) continue;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(file)});`],
    {
      encoding: "utf8",
      timeout: 20000,
      env: { ...process.env, NODE_OPTIONS: `--import ${JSON.stringify(join(root, "tests/dom-shim.mjs"))}` }
    }
  );
  if (result.status !== 0) {
    const message = (result.stderr || "").split("\n").find((l) => /Error/.test(l)) || "failed to evaluate";
    fail(`${rel}: ${message.trim()}`);
    evalFailures++;
  }
}
if (evalFailures === 0) ok("every module evaluates without a reference error");

// ---- 4. No package manager / dependency / build artifacts ----------------
const banned = ["package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "node_modules", "dist", "build", ".parcel-cache"];
let bannedFound = 0;
for (const name of banned) {
  if (existsSync(join(root, name))) { fail(`banned path present: ${name}`); bannedFound++; }
}
if (bannedFound === 0) ok("no package manager, dependency, or build artifacts");

if (problems > 0) {
  console.error(`\n${problems} project audit problem(s).`);
  process.exit(1);
}
console.log("\nProject audit passed.");
