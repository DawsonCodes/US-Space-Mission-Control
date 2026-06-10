// Launch-image resolver.
//
// Priority order (deterministic — the same launch always resolves the same way):
//  1. LL2 mission-specific image
//  2. LL2 rocket-configuration image
//  3. Neutral placeholder (no local artwork): the renderer shows a quiet, dark
//     "No mission image available" panel that matches the cinematic UI.
//
// The previous illustrated SVG fallbacks were removed in v3.1.0 — stylized
// rocket drawings clashed with real launch photography. No images are scraped
// or bundled; see assets/images/ATTRIBUTION.md.

import { safeUrl } from "./utils.js";

// Returns { src, kind } where kind is "mission" | "rocket" | "placeholder".
// src is null for the placeholder — callers render the neutral panel instead
// of an <img>, which also covers missing and malformed URLs (safeUrl rejects
// non-http(s) values).
export function resolveLaunchImage(launch) {
  const mission = safeUrl(launch?.missionImage || launch?.image);
  if (mission) return { src: mission, kind: "mission" };

  const rocket = safeUrl(launch?.rocketImage);
  if (rocket) return { src: rocket, kind: "rocket" };

  return { src: null, kind: "placeholder" };
}

// Meaningful alt text: mission name plus provider context when available.
export function launchImageAlt(launch) {
  const name = launch?.name || launch?.missionName || "Upcoming mission";
  const provider = launch?.providerName || launch?.provider || "";
  return provider ? `${name} — ${provider}` : name;
}
