// Organization, mission-type, flight-type, and status classification.
//
// Modeling rules (deliberate):
//  - NASA is a civil *agency* overlay, matched on a launch's mission agencies.
//  - SpaceX, Blue Origin, and Rocket Lab are launch *providers*, matched on the
//    launch service provider. They are NOT modeled as agencies.
//  - A launch can carry multiple organization tags (e.g. a NASA mission flying
//    on a SpaceX or Rocket Lab rocket is tagged with both organizations).
//    Counts may overlap.
//
// All classification fallbacks are documented inline. Provider/agency IDs are
// verified values from config.js; name matching is a resilient fallback only.

import {
  SPACEX_PROVIDER_ID,
  BLUE_ORIGIN_PROVIDER_ID,
  ROCKET_LAB_PROVIDER_ID,
  ULA_PROVIDER_ID,
  FIREFLY_PROVIDER_ID,
  NASA_AGENCY_ID
} from "./config.js";

export const ORG = {
  ALL: "all",
  NASA: "nasa",
  SPACEX: "spacex",
  BLUE_ORIGIN: "blue-origin",
  ROCKET_LAB: "rocket-lab",
  ULA: "ula",
  FIREFLY: "firefly"
};

export const ORG_LABELS = {
  all: "All tracked missions",
  nasa: "NASA",
  spacex: "SpaceX",
  "blue-origin": "Blue Origin",
  "rocket-lab": "Rocket Lab",
  ula: "ULA",
  firefly: "Firefly"
};

export const ORG_BADGE_CLASS = {
  nasa: "org-nasa",
  spacex: "org-spacex",
  "blue-origin": "org-blueorigin",
  "rocket-lab": "org-rocketlab",
  ula: "org-ula",
  firefly: "org-firefly"
};

// Provider organizations only (NASA is an agency overlay, handled separately).
export const PROVIDER_ORGS = [ORG.SPACEX, ORG.BLUE_ORIGIN, ORG.ROCKET_LAB, ORG.ULA, ORG.FIREFLY];

// ---- Organization matchers -----------------------------------------------

export function isNASA(launch) {
  const agencies = Array.isArray(launch?.agencies) ? launch.agencies : [];
  if (agencies.some((a) => Number(a?.id) === NASA_AGENCY_ID)) return true;
  // Fallback: match by agency name when an id is missing from partial data.
  return agencies.some((a) => /nasa|national aeronautics/i.test(a?.name || ""));
}

export function isSpaceX(launch) {
  if (Number(launch?.providerId) === SPACEX_PROVIDER_ID) return true;
  return /spacex/i.test(launch?.providerName || launch?.provider || "");
}

export function isBlueOrigin(launch) {
  if (Number(launch?.providerId) === BLUE_ORIGIN_PROVIDER_ID) return true;
  return /blue\s*origin/i.test(launch?.providerName || launch?.provider || "");
}

export function isRocketLab(launch) {
  if (Number(launch?.providerId) === ROCKET_LAB_PROVIDER_ID) return true;
  return /rocket\s*lab/i.test(launch?.providerName || launch?.provider || "");
}

export function isULA(launch) {
  if (Number(launch?.providerId) === ULA_PROVIDER_ID) return true;
  return /united\s*launch\s*alliance|\bula\b/i.test(launch?.providerName || launch?.provider || "");
}

export function isFirefly(launch) {
  if (Number(launch?.providerId) === FIREFLY_PROVIDER_ID) return true;
  return /firefly/i.test(launch?.providerName || launch?.provider || "");
}

// Subset of org tags that apply to a launch (overlap ok).
export function orgTags(launch) {
  const tags = [];
  if (isNASA(launch)) tags.push(ORG.NASA);
  if (isSpaceX(launch)) tags.push(ORG.SPACEX);
  if (isBlueOrigin(launch)) tags.push(ORG.BLUE_ORIGIN);
  if (isRocketLab(launch)) tags.push(ORG.ROCKET_LAB);
  if (isULA(launch)) tags.push(ORG.ULA);
  if (isFirefly(launch)) tags.push(ORG.FIREFLY);
  return tags;
}

// Matcher used by overview tile counts: org id -> predicate.
export const ORG_MATCHERS = {
  nasa: isNASA,
  spacex: isSpaceX,
  "blue-origin": isBlueOrigin,
  "rocket-lab": isRocketLab,
  ula: isULA,
  firefly: isFirefly
};

export function matchesOrg(launch, org) {
  if (!org || org === ORG.ALL) return true;
  return orgTags(launch).includes(org);
}

// ---- Mission-type classification -----------------------------------------

export const MISSION_TYPE_LABELS = {
  crew: "Crew",
  cargo: "Cargo",
  science: "Science",
  starlink: "Starlink",
  rideshare: "Rideshare",
  commercial: "Commercial",
  "national-security": "National security",
  "test-flight": "Test flight",
  other: "Unclassified"
};

export function missionTypeBadgeClass(type) {
  return `type-${type}`;
}

function textHaystack(launch) {
  return [launch?.name, launch?.missionName, launch?.details, launch?.program, launch?.rocket]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function agencyHaystack(launch) {
  const agencies = Array.isArray(launch?.agencies) ? launch.agencies : [];
  return agencies
    .map((a) => `${a?.name || ""} ${a?.type || ""} ${a?.abbrev || ""}`)
    .join(" ")
    .toLowerCase();
}

// Ordered, evidence-based classification. Order matters:
//  1. Starlink is unambiguous.
//  2. Cargo is checked BEFORE crew so a cargo Dragon / CRS flight is never
//     misread as crew just because it carries "Dragon".
//  3. Crew requires crew-specific evidence (crew/crewed/astronaut or a human
//     spaceflight mission-type), never the mere presence of "Dragon".
//  4. Rideshare (Transporter / Bandwagon).
//  5. National security (USSF / NRO / Space Force / NSSL).
//  6. Science requires real science signals — NASA presence ALONE does not
//     imply science (a NASA cargo or crew flight stays cargo/crew).
//  7. Test flights, then commercial.
//  8. "other" (shown as "Unclassified") is the last-resort fallback only.
export function classifyMissionType(launch) {
  const mt = String(launch?.missionType || "").toLowerCase();
  const text = textHaystack(launch);
  const agencies = agencyHaystack(launch);
  const all = `${text} ${mt} ${agencies}`;

  if (text.includes("starlink")) return "starlink";

  if (/\bcrs\b|\bcrs-|cargo|cygnus|resupply|dragon\s*cargo/.test(text) || mt.includes("resupply")) {
    return "cargo";
  }

  if (/\bcrew\b|crewed|astronaut|crew\s*dragon/.test(text) || mt.includes("human")) {
    return "crew";
  }

  if (/transporter|bandwagon|rideshare/.test(all) || mt.includes("rideshare")) {
    return "rideshare";
  }

  if (
    /\bnssl\b|\bnro\b|space\s*force|\bussf\b|national\s*security|space\s*development\s*agency|missile\s*defense/.test(all) ||
    mt.includes("top secret") ||
    mt.includes("security")
  ) {
    return "national-security";
  }

  if (
    mt.includes("science") ||
    mt.includes("astrophysics") ||
    mt.includes("planetary") ||
    mt.includes("earth science") ||
    /\blunar\b|planetary|telescope|observatory|\brover\b|\bprobe\b|astrophysics/.test(text)
  ) {
    return "science";
  }

  if (mt.includes("test") || /flight\s*test|test\s*flight|maiden\s*flight|integrated\s*flight\s*test/.test(text)) {
    return "test-flight";
  }

  if (mt.includes("communications") || mt.includes("commercial") || mt.includes("tourism") || /commercial/.test(text)) {
    return "commercial";
  }

  return "other";
}

// ---- Flight-type classification ------------------------------------------
// Three honest states: orbital | suborbital | unknown.
//  - Verified orbit data wins. A named orbit (LEO, GTO, SSO, …) means orbital;
//    an orbit named/abbreviated "suborbital" means suborbital.
//  - With no orbit data, fall back to rocket family ONLY where reliable
//    (Blue Origin New Shepard is suborbital; New Glenn / Falcon / Starship /
//    Electron / Neutron are orbital launch vehicles).
//  - Otherwise "unknown" — never guess "orbital" for missing data. The UI omits
//    the flight-type badge for unknown and the explicit filters exclude it.
const SUBORBITAL_RE = /sub[\s-]?orbital/i;

export function flightType(launch) {
  const orbit = `${launch?.orbitName || ""} ${launch?.orbitAbbrev || ""}`.trim();
  if (orbit) {
    return SUBORBITAL_RE.test(orbit) ? "suborbital" : "orbital";
  }
  const rocket = `${launch?.rocket || ""} ${launch?.rocketFamily || ""}`.toLowerCase();
  if (/new\s*shepard/.test(rocket)) return "suborbital";
  if (/new\s*glenn|falcon|starship|electron|neutron|vulcan|atlas|delta|alpha/.test(rocket)) return "orbital";
  return "unknown";
}

export const FLIGHT_TYPE_LABELS = {
  orbital: "Orbital",
  suborbital: "Suborbital"
};

// ---- Orbit classification -------------------------------------------------
// Conservative normalization of LL2 orbit names/abbreviations into a small set
// of filterable buckets. "unknown" means no orbit data at all; "other" means an
// orbit is named but doesn't match a known bucket (it still shows under All
// orbits, never under a specific orbit filter, and is not mislabeled unknown).
export const ORBIT_LABELS = {
  leo: "Low Earth orbit",
  sso: "Sun-synchronous orbit",
  gto: "Geostationary transfer orbit",
  geo: "Geostationary orbit",
  meo: "Medium Earth orbit",
  polar: "Polar orbit",
  lunar: "Lunar",
  interplanetary: "Interplanetary",
  suborbital: "Suborbital",
  unknown: "Unknown orbit"
};

export function orbitCategory(launch) {
  const text = `${launch?.orbitName || ""} ${launch?.orbitAbbrev || ""}`.trim().toLowerCase();
  if (!text) return "unknown";
  if (SUBORBITAL_RE.test(text)) return "suborbital";
  if (/sun-?synchronous|\bsso\b|helio-?synchronous/.test(text)) return "sso";
  if (/transfer|\bgto\b|\bgeo\s*transfer\b/.test(text)) return "gto";
  if (/geostationary|geosynchronous|\bgeo\b/.test(text)) return "geo";
  if (/medium\s*earth|\bmeo\b/.test(text)) return "meo";
  if (/\blunar\b|\bmoon\b|trans-?lunar|\btli\b|cislunar/.test(text)) return "lunar";
  if (/helio|interplanetary|\bmars\b|trans-?mars|escape|solar|venus|jupiter/.test(text)) return "interplanetary";
  if (/polar/.test(text)) return "polar";
  if (/low\s*earth|\bleo\b/.test(text)) return "leo";
  return "other";
}

// ---- Launch-site classification -------------------------------------------
// Conservative text matching over normalized pad + location data, with a final
// "other" bucket so nothing is dropped. Multiple naming variants are tolerated.
export const LAUNCH_SITE_LABELS = {
  "cape-canaveral": "Cape Canaveral",
  kennedy: "Kennedy Space Center",
  vandenberg: "Vandenberg",
  wallops: "Wallops",
  "rocketlab-lc1": "Rocket Lab Launch Complex 1",
  other: "Other launch sites"
};

export function launchSiteCategory(launch) {
  const text = `${launch?.padName || ""} ${launch?.location || ""}`.trim().toLowerCase();
  if (!text) return "other";
  if (/mahia|rocket\s*lab\s*launch\s*complex\s*1|\blc-?1\b/.test(text)) return "rocketlab-lc1";
  if (/kennedy|\bksc\b/.test(text)) return "kennedy";
  if (/cape\s*canaveral|\bccsfs\b|\bccafs\b/.test(text)) return "cape-canaveral";
  if (/vandenberg|\bvsfb\b|\bvafb\b/.test(text)) return "vandenberg";
  if (/wallops|\bmars\s*pad\b|mid-?atlantic\s*regional/.test(text)) return "wallops";
  return "other";
}

// ---- Status normalization -------------------------------------------------
// Maps LL2 status names/abbreviations to a label + CSS key for the status badge.
export function normalizeStatus(launch) {
  const name = String(launch?.statusName || "").trim();
  const lower = name.toLowerCase();
  let key = "tbd";
  if (/go for launch|^go$/.test(lower)) key = "go";
  else if (/hold/.test(lower)) key = "hold";
  else if (/success/.test(lower)) key = "success";
  else if (/failure/.test(lower)) key = "failure";
  else if (/in flight|in-flight/.test(lower)) key = "inflight";
  else if (/to be confirmed|\btbc\b/.test(lower)) key = "tbc";
  else if (/to be determined|\btbd\b/.test(lower)) key = "tbd";
  else if (lower) key = "tbd";
  return { label: name || "To Be Determined", key };
}

export function statusBadgeClass(launch) {
  return `status-${normalizeStatus(launch).key}`;
}
