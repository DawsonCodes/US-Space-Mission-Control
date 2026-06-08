// Launch-image resolver.
//
// Priority order (deterministic — the same launch always resolves the same way):
//  1. LL2 mission-specific image
//  2. LL2 rocket-configuration image
//  3. Local provider-neutral SVG fallback chosen by flight type
//
// We intentionally ship only a small set of original, provider-neutral SVG
// placeholders (no scraped photos, no brand logos). A larger curated photo pack
// is a possible future enhancement, not part of v3.0.0. See
// assets/images/ATTRIBUTION.md.

import { safeUrl } from "./utils.js";
import { flightType } from "./organizations.js";

const FALLBACK_DIR = "assets/images/fallbacks/";

const FALLBACKS = {
  orbital: "orbital-launch.svg",
  suborbital: "suborbital-flight.svg",
  unknown: "space-mission.svg"
};

// Returns { src, kind, isFallback } where kind is "mission" | "rocket" | "fallback".
export function resolveLaunchImage(launch) {
  const mission = safeUrl(launch?.missionImage || launch?.image);
  if (mission) return { src: mission, kind: "mission", isFallback: false };

  const rocket = safeUrl(launch?.rocketImage);
  if (rocket) return { src: rocket, kind: "rocket", isFallback: false };

  const ft = flightType(launch);
  const file = FALLBACKS[ft] || FALLBACKS.unknown;
  return { src: `${FALLBACK_DIR}${file}`, kind: "fallback", isFallback: true };
}

// Meaningful alt text: mission name plus provider context when available.
export function launchImageAlt(launch) {
  const name = launch?.name || launch?.missionName || "Upcoming mission";
  const provider = launch?.providerName || launch?.provider || "";
  return provider ? `${name} — ${provider}` : name;
}
