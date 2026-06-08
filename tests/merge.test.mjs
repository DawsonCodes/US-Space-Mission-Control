// Tests the conservative field-level merge + dedupe in js/api.js.
// Runnable in Node (`node tests/merge.test.mjs`).

import assert from "node:assert/strict";
import { dedupeMerge, mergeLaunch } from "../js/api.js";
import { isNASA, isSpaceX, orgTags } from "../js/organizations.js";

const NASA = { id: 44, name: "NASA", type: "Government", abbrev: "NASA" };

// Same launch id seen in both feeds. Provider feed (A) has SpaceX provider +
// imagery; NASA feed (B) has the NASA agency tag + a richer description.
const providerSide = {
  id: "ll-123",
  name: "Falcon 9 | NASA Science",
  net: "2026-07-01T12:00:00Z",
  provider: "SpaceX",
  providerName: "SpaceX",
  providerId: 121,
  agencies: [],
  details: "Short blurb.",
  missionImage: "https://example.com/img.jpg",
  rocket: "Falcon 9 Block 5",
  lastUpdated: "2026-06-01T00:00:00Z"
};

const nasaSide = {
  id: "ll-123",
  name: "Falcon 9 | NASA Science",
  net: "2026-07-01T12:00:00Z",
  provider: "",
  providerName: "",
  providerId: null,
  agencies: [NASA],
  details: "A much longer, richer mission description provided by the NASA feed.",
  missionImage: "",
  rocket: "Falcon 9",
  lastUpdated: "2026-06-05T00:00:00Z"
};

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`ok  - ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL - ${label}: ${err.message}`);
  }
}

check("dedupe collapses the duplicate to one record", () => {
  const merged = dedupeMerge([providerSide], [nasaSide]);
  assert.equal(merged.length, 1);
});

check("merged record keeps SpaceX provider metadata", () => {
  const m = mergeLaunch(providerSide, nasaSide);
  assert.equal(m.providerName, "SpaceX");
  assert.equal(m.providerId, 121);
  assert.ok(isSpaceX(m));
});

check("merged record gains the NASA agency tag (union)", () => {
  const m = mergeLaunch(providerSide, nasaSide);
  assert.ok(isNASA(m));
  assert.deepEqual(orgTags(m).sort(), ["nasa", "spacex"]);
});

check("merged record keeps the richer description and non-empty image", () => {
  const m = mergeLaunch(providerSide, nasaSide);
  assert.ok(m.details.startsWith("A much longer"));
  assert.equal(m.missionImage, "https://example.com/img.jpg");
});

check("merged record keeps the more recent lastUpdated", () => {
  const m = mergeLaunch(providerSide, nasaSide);
  assert.equal(m.lastUpdated, "2026-06-05T00:00:00Z");
});

check("agencies are de-duplicated by id", () => {
  const m = mergeLaunch({ ...providerSide, agencies: [NASA] }, nasaSide);
  assert.equal(m.agencies.length, 1);
});

if (failures > 0) {
  console.error(`\n${failures} merge test(s) failed.`);
  process.exit(1);
}
console.log("\nAll merge tests passed.");
