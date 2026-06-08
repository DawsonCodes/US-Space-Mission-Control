# Image attribution

## Local fallback artwork

The SVGs in `fallbacks/` are **original, provider-neutral artwork** created for
this project (U.S. Space Mission Control). They contain no brand logos, no
trademarked marks, and no third-party photography.

| File | Purpose |
| ---- | ------- |
| `fallbacks/orbital-launch.svg` | Generic orbital-launch placeholder |
| `fallbacks/suborbital-flight.svg` | Generic suborbital-flight placeholder |
| `fallbacks/space-mission.svg` | Generic space-mission placeholder (unknown flight type) |

These are released under the same [MIT License](../../LICENSE) as the rest of
the project and may be reused freely.

## Live imagery

Mission-specific and rocket-configuration images shown on launch cards come from
the [Launch Library 2](https://thespacedevs.com/llapi) API by The Space Devs and
are loaded directly from their image URLs at runtime — they are **not** copied
into this repository. The local fallbacks above are used only when LL2 provides
no image (or an image fails to load).

## Image strategy

`js/images.js` resolves a launch image in this deterministic priority order:

1. LL2 mission-specific image
2. LL2 rocket-configuration image
3. Local provider-neutral SVG fallback chosen by flight type

A larger curated photo pack (per mission family / rocket family) is a possible
future enhancement; it is intentionally out of scope for v3.0.0 so the project
ships only assets with clear reuse rights.
