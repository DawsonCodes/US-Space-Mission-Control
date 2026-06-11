// Tests for js/status-timer.js — the single source of truth for the status
// banner countdown. Pure + deterministic (wall-clock `now` is injected).

import assert from "node:assert/strict";
import { createStatusTimer, STATUS_DURATION_MS } from "../js/status-timer.js";

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`ok  - ${label}`); } catch (e) { failures++; console.error(`FAIL - ${label}: ${e.message}`); }
};

check("default duration is exactly 10 seconds", () => {
  assert.equal(STATUS_DURATION_MS, 10000);
  const t = createStatusTimer();
  assert.equal(t.duration, 10000);
});

check("seconds and progress derive from the SAME remaining value (synchronized)", () => {
  const t = createStatusTimer(10000);
  const t0 = 1000;
  t.start(t0);
  // 3.2s elapsed -> 6.8s remaining
  const now = t0 + 3200;
  assert.equal(t.remaining(now), 6800);
  assert.equal(t.seconds(now), 7); // ceil(6.8)
  assert.equal(t.progress(now), 0.68); // 6800 / 10000
});

check("progress reaches 0 exactly at the deadline; isExpired flips there", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  assert.ok(t.progress(9999) > 0); // still non-zero just before the deadline
  assert.equal(t.remaining(10000), 0);
  assert.equal(t.progress(10000), 0);
  assert.equal(t.seconds(10000), 0);
  assert.ok(!t.isExpired(9999));
  assert.ok(t.isExpired(10000));
});

check("hover/keyboard pause preserves the exact remaining time", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  t.pause(4000); // 6000 ms remaining
  assert.ok(t.isPaused());
  // Time passes while paused — remaining must NOT change.
  assert.equal(t.remaining(9000), 6000);
  assert.equal(t.seconds(9000), 6);
  assert.equal(t.progress(9000), 0.6);
});

check("resume continues from the preserved remaining (no random pause/drift)", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  t.pause(4000); // 6000 remaining
  t.resume(9000); // resumed at now=9000 with 6000 remaining -> deadline 15000
  assert.ok(!t.isPaused());
  assert.equal(t.remaining(9000), 6000);
  assert.equal(t.remaining(12000), 3000);
  assert.ok(t.isExpired(15000));
});

check("double pause / resume-without-pause are no-ops", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  t.pause(2000);
  t.pause(3000); // ignored
  assert.equal(t.remaining(8000), 8000);
  t.resume(5000);
  t.resume(6000); // ignored (already running)
  assert.equal(t.remaining(6000), 7000);
});

check("a replacement message resets the lifecycle correctly", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  t.pause(3000);
  t.start(20000); // new message
  assert.ok(!t.isPaused());
  assert.equal(t.remaining(20000), 10000);
  assert.equal(t.remaining(25000), 5000);
});

check("stop ends the timer; remaining is 0 and not expired", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  t.stop();
  assert.ok(!t.isActive());
  assert.equal(t.remaining(1000), 0);
  assert.ok(!t.isExpired(99999));
});

check("hidden-tab time jump does not corrupt timing (wall-clock based)", () => {
  const t = createStatusTimer(10000);
  t.start(0);
  // Tab hidden for a long time, then a single tick at now=8000.
  assert.equal(t.remaining(8000), 2000);
  // Jump past the deadline -> clamps to 0 + expired, never negative.
  assert.equal(t.remaining(50000), 0);
  assert.ok(t.isExpired(50000));
});

if (failures > 0) { console.error(`\n${failures} status-timer test(s) failed.`); process.exit(1); }
console.log("\nAll status-timer tests passed.");
