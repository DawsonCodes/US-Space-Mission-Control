// Lightweight, dependency-free classification tests for js/organizations.js.
// Runnable in Node (`node tests/classification.test.mjs`) or any ES-module host.
// These guard the v3 rules: cargo-before-crew, NASA-does-not-imply-science,
// honest orbital/suborbital/unknown flight typing, and organization overlap.

import assert from "node:assert/strict";
import {
  classifyMissionType,
  flightType,
  orgTags,
  isNASA,
  isSpaceX,
  isBlueOrigin
} from "../js/organizations.js";

const NASA = { id: 44, name: "National Aeronautics and Space Administration", type: "Government", abbrev: "NASA" };

const cases = [
  // [name, launch, expectedMissionType, expectedFlightType]
  ["Crew Dragon", { name: "Falcon 9 | Crew-9", missionType: "Human Exploration", rocket: "Falcon 9", orbitName: "Low Earth Orbit" }, "crew", "orbital"],
  ["Cargo Dragon / CRS", { name: "Falcon 9 | CRS-31 (Cargo Dragon)", missionType: "Resupply", rocket: "Falcon 9", orbitName: "Low Earth Orbit" }, "cargo", "orbital"],
  ["Starlink", { name: "Falcon 9 | Starlink Group 12-2", missionType: "Communications", rocket: "Falcon 9", orbitName: "Low Earth Orbit" }, "starlink", "orbital"],
  ["Rideshare / Transporter", { name: "Falcon 9 | Transporter-13", missionType: "Dedicated Rideshare", rocket: "Falcon 9", orbitName: "SSO" }, "rideshare", "orbital"],
  ["NASA science", { name: "Falcon Heavy | NASA Planetary Probe", missionType: "Planetary Science", agencies: [NASA], rocket: "Falcon Heavy", orbitName: "Heliocentric" }, "science", "orbital"],
  ["NASA cargo (not science)", { name: "Falcon 9 | NASA CRS Cargo Dragon", missionType: "Resupply", agencies: [NASA], rocket: "Falcon 9", orbitName: "Low Earth Orbit" }, "cargo", "orbital"],
  ["Starship test flight", { name: "Starship | Integrated Flight Test", missionType: "Test Flight", rocket: "Starship", orbitName: "" }, "test-flight", "orbital"],
  ["New Glenn (orbital)", { name: "New Glenn | Comsat", missionType: "Communications", rocket: "New Glenn", providerName: "Blue Origin", providerId: 141, orbitName: "Low Earth Orbit" }, "commercial", "orbital"],
  ["New Shepard (suborbital)", { name: "New Shepard | NS-30", missionType: "Tourism", rocket: "New Shepard", providerName: "Blue Origin", providerId: 141, orbitName: "Suborbital", orbitAbbrev: "Sub" }, "commercial", "suborbital"]
];

let failures = 0;
for (const [label, launch, expectType, expectFlight] of cases) {
  try {
    assert.equal(classifyMissionType(launch), expectType, `${label}: mission type`);
    assert.equal(flightType(launch), expectFlight, `${label}: flight type`);
    console.log(`ok  - ${label} (${expectType}, ${expectFlight})`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL - ${err.message}`);
  }
}

// Flight type must be honest: no orbit data + unrecognized rocket => unknown.
try {
  assert.equal(flightType({ name: "Mystery launch", rocket: "Unknown Rocket", orbitName: "" }), "unknown", "missing orbit => unknown");
  console.log("ok  - missing orbit + unknown rocket => unknown");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

// Organization overlap: a NASA mission on SpaceX is tagged BOTH NASA and SpaceX.
try {
  const overlap = { providerName: "SpaceX", providerId: 121, agencies: [NASA] };
  assert.ok(isNASA(overlap), "overlap is NASA");
  assert.ok(isSpaceX(overlap), "overlap is SpaceX");
  assert.ok(!isBlueOrigin(overlap), "overlap is not Blue Origin");
  assert.deepEqual(orgTags(overlap).sort(), ["nasa", "spacex"], "overlap org tags");
  console.log("ok  - NASA-on-SpaceX overlap tags both organizations");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} classification test(s) failed.`);
  process.exit(1);
}
console.log("\nAll classification tests passed.");
