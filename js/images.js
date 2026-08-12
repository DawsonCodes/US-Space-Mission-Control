// Launch-image resolver.
//
// Priority order (deterministic — the same launch always resolves the same way):
//  1. Mission patch (unique per mission)
//  2. LL2 mission image
//  3. Launch-pad photo (unique per pad)
//  4. Program image
//  5. Rocket-configuration image (shared by every flight of that rocket)
//  6. Neutral placeholder (no local artwork): the renderer shows a quiet, dark
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
  // Most specific first. LL2's launch `image` is nearly always the rocket
  // CONFIGURATION photo, which is why a hundred Falcon 9 flights all showed the
  // same picture; a mission patch or a pad photo actually distinguishes them.
  for (const [kind, value] of [
    ["patch", launch?.patchImage],
    ["mission", launch?.missionImage || launch?.image],
    ["pad", launch?.padImage],
    ["program", launch?.programImage],
    ["rocket", launch?.rocketImage]
  ]) {
    const src = safeUrl(value);
    if (src) return { src, kind };
  }

  return { src: null, kind: "placeholder" };
}

// How to describe where a picture came from, for the caption under it.
const IMAGE_SOURCE_LABEL = {
  patch: "Mission patch",
  mission: "Mission image",
  pad: "Launch pad",
  program: "Program image",
  rocket: "Rocket image"
};

export function launchImageLabel(kind) {
  return IMAGE_SOURCE_LABEL[kind] || "Mission image";
}

// Meaningful alt text: mission name plus provider context when available.
export function launchImageAlt(launch) {
  const name = launch?.name || launch?.missionName || "Upcoming mission";
  const provider = launch?.providerName || launch?.provider || "";
  return provider ? `${name} — ${provider}` : name;
}
