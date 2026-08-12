// Launch-image resolver.
//
// Priority order (deterministic — the same launch always resolves the same way):
//  1. LL2 mission image (a photograph)
//  2. Launch-pad photo
//  3. Rocket-configuration image (shared by every flight of that rocket)
//  4. Neutral placeholder
//
// Mission patches and program logos are deliberately excluded. They are
// artwork, not photographs, and a circular logo in a landscape photo frame
// looks like a mistake next to the cards either side of it. (no local artwork): the renderer shows a quiet, dark
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
  // Photographs only, most specific first. Mission patches were tried above the
  // photo and it was a mistake: a patch is a circular logo, so a card that
  // should show a rocket showed a Starlink roundel instead. Patches are not used
  // at all; a repeated photo of the right vehicle beats a crisp picture of the
  // wrong thing.
  for (const [kind, value] of [
    ["mission", launch?.missionImage || launch?.image],
    ["pad", launch?.padImage],
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
