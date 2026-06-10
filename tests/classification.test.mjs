// Lightweight, dependency-free classification tests for js/organizations.js.
// Runnable in Node (`node tests/classification.test.mjs`) or any ES-module host.
// These guard the v3 rules: cargo-before-crew, NASA-does-not-imply-science,
// honest orbital/suborbital/unknown flight typing, and organization overlap.

import assert from "node:assert/strict";
import {
  classifyMissionType,
  flightType,
  orbitCategory,
  launchSiteCategory,
  orgTags,
  isNASA,
  isSpaceX,
  isBlueOrigin,
  isRocketLab,
  isULA,
  isFirefly
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
  ["New Shepard (suborbital)", { name: "New Shepard | NS-30", missionType: "Tourism", rocket: "New Shepard", providerName: "Blue Origin", providerId: 141, orbitName: "Suborbital", orbitAbbrev: "Sub" }, "commercial", "suborbital"],
  ["Electron (orbital)", { name: "Electron | Smallsat Rideshare", missionType: "Dedicated Rideshare", rocket: "Electron", providerName: "Rocket Lab", providerId: 147, orbitName: "Sun-Synchronous Orbit" }, "rideshare", "orbital"],
  ["Electron fallback (no orbit data => orbital)", { name: "Electron | Mystery Payload", missionType: "", rocket: "Electron", providerName: "Rocket Lab", providerId: 147, orbitName: "" }, "other", "orbital"],
  ["Vulcan (ULA, orbital)", { name: "Vulcan VC4 | Comsat", missionType: "Communications", rocket: "Vulcan VC4", providerName: "United Launch Alliance", providerId: 124, orbitName: "Geostationary Transfer Orbit" }, "commercial", "orbital"],
  ["Atlas V national security", { name: "Atlas V 551 | NROL", missionType: "Government/Top Secret", rocket: "Atlas V 551", providerName: "United Launch Alliance", providerId: 124, orbitName: "" }, "national-security", "orbital"],
  ["Alpha (Firefly, orbital)", { name: "Alpha | Smallsat", missionType: "Commercial", rocket: "Alpha", providerName: "Firefly Aerospace", providerId: 265, orbitName: "Low Earth Orbit" }, "commercial", "orbital"]
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

// NASA-on-Rocket-Lab overlap, and commercial Rocket Lab staying NASA-free.
try {
  const overlap = { providerName: "Rocket Lab", providerId: 147, agencies: [NASA] };
  assert.ok(isNASA(overlap), "overlap is NASA");
  assert.ok(isRocketLab(overlap), "overlap is Rocket Lab");
  assert.deepEqual(orgTags(overlap).sort(), ["nasa", "rocket-lab"], "overlap org tags");

  const commercial = { providerName: "Rocket Lab", providerId: 147, agencies: [] };
  assert.ok(isRocketLab(commercial), "commercial is Rocket Lab");
  assert.ok(!isNASA(commercial), "commercial is not NASA");
  assert.deepEqual(orgTags(commercial), ["rocket-lab"], "commercial org tags");
  console.log("ok  - NASA-on-Rocket-Lab overlap; commercial Rocket Lab stays NASA-free");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

// NASA-on-Blue-Origin overlap.
try {
  const overlap = { providerName: "Blue Origin", providerId: 141, agencies: [NASA] };
  assert.ok(isNASA(overlap) && isBlueOrigin(overlap), "overlap tags");
  assert.deepEqual(orgTags(overlap).sort(), ["blue-origin", "nasa"], "overlap org tags");
  console.log("ok  - NASA-on-Blue-Origin overlap tags both organizations");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

// NASA-on-ULA overlap; commercial ULA stays NASA-free.
try {
  const overlap = { providerName: "United Launch Alliance", providerId: 124, agencies: [NASA] };
  assert.ok(isNASA(overlap) && isULA(overlap), "overlap tags");
  assert.deepEqual(orgTags(overlap).sort(), ["nasa", "ula"], "overlap org tags");
  const commercial = { providerName: "United Launch Alliance", providerId: 124, agencies: [] };
  assert.ok(isULA(commercial) && !isNASA(commercial), "commercial ULA not NASA");
  assert.deepEqual(orgTags(commercial), ["ula"], "commercial org tags");
  console.log("ok  - NASA-on-ULA overlap; commercial ULA stays NASA-free");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

// NASA-on-Firefly overlap; commercial Firefly stays NASA-free.
try {
  const overlap = { providerName: "Firefly Aerospace", providerId: 265, agencies: [NASA] };
  assert.ok(isNASA(overlap) && isFirefly(overlap), "overlap tags");
  assert.deepEqual(orgTags(overlap).sort(), ["firefly", "nasa"], "overlap org tags");
  const commercial = { providerName: "Firefly Aerospace", providerId: 265, agencies: [] };
  assert.ok(isFirefly(commercial) && !isNASA(commercial), "commercial Firefly not NASA");
  assert.deepEqual(orgTags(commercial), ["firefly"], "commercial org tags");
  console.log("ok  - NASA-on-Firefly overlap; commercial Firefly stays NASA-free");
} catch (err) {
  failures += 1;
  console.error(`FAIL - ${err.message}`);
}

// Orbit normalization buckets (conservative; unknown stays unknown).
try {
  assert.equal(orbitCategory({ orbitName: "Low Earth Orbit", orbitAbbrev: "LEO" }), "leo");
  assert.equal(orbitCategory({ orbitName: "Sun-Synchronous Orbit", orbitAbbrev: "SSO" }), "sso");
  assert.equal(orbitCategory({ orbitName: "Geostationary Transfer Orbit", orbitAbbrev: "GTO" }), "gto");
  assert.equal(orbitCategory({ orbitName: "Geostationary Orbit", orbitAbbrev: "GEO" }), "geo");
  assert.equal(orbitCategory({ orbitName: "Medium Earth Orbit", orbitAbbrev: "MEO" }), "meo");
  assert.equal(orbitCategory({ orbitName: "Polar Orbit" }), "polar");
  assert.equal(orbitCategory({ orbitName: "Trans-Lunar Injection" }), "lunar");
  assert.equal(orbitCategory({ orbitName: "Heliocentric" }), "interplanetary");
  assert.equal(orbitCategory({ orbitName: "Suborbital", orbitAbbrev: "Sub" }), "suborbital");
  assert.equal(orbitCategory({ orbitName: "" }), "unknown");
  console.log("ok  - orbit normalization buckets");
} catch (err) {
  failures += 1;
  console.error(`FAIL - orbit: ${err.message}`);
}

// Launch-site categorization (conservative variants; other fallback).
try {
  assert.equal(launchSiteCategory({ padName: "SLC-40", location: "Cape Canaveral SFS, FL, USA" }), "cape-canaveral");
  assert.equal(launchSiteCategory({ padName: "LC-39A", location: "Kennedy Space Center, FL, USA" }), "kennedy");
  assert.equal(launchSiteCategory({ location: "Vandenberg SFB, CA, USA" }), "vandenberg");
  assert.equal(launchSiteCategory({ location: "Wallops Island, Virginia, USA" }), "wallops");
  assert.equal(launchSiteCategory({ location: "Mahia Peninsula, New Zealand" }), "rocketlab-lc1");
  assert.equal(launchSiteCategory({ location: "Baikonur Cosmodrome" }), "other");
  assert.equal(launchSiteCategory({ padName: "", location: "" }), "other");
  console.log("ok  - launch-site categorization");
} catch (err) {
  failures += 1;
  console.error(`FAIL - launch site: ${err.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} classification test(s) failed.`);
  process.exit(1);
}
console.log("\nAll classification tests passed.");
