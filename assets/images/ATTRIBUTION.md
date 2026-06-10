# Image & map attribution

## Live launch imagery

Mission-specific and rocket-configuration images shown on launch cards come from
the [Launch Library 2](https://thespacedevs.com/llapi) API by The Space Devs and
are loaded directly from their image URLs at runtime — they are **not** copied
into this repository.

## No-image placeholder

When Launch Library 2 provides no usable image (or an image fails to load), the
app shows a neutral, CSS-only placeholder panel reading
**"No mission image available"** over the card's existing dark gradient. No
placeholder image files are bundled.

> The illustrated SVG rocket fallbacks shipped in v3.0.0 were removed in
> v3.1.0 — stylized drawings clashed with real launch photography.

## Image strategy

`js/images.js` resolves a launch image in this deterministic priority order:

1. LL2 mission-specific image
2. LL2 rocket-configuration image
3. Neutral "No mission image available" placeholder

## OpenStreetMap

The "Open pad map" action in the mission-details modal links to
[OpenStreetMap](https://www.openstreetmap.org/) centered on the launch pad's
Launch Library 2 coordinates. No map tiles or third-party map requests are
loaded by the app itself — the map opens externally only when the user clicks
the action.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, available under the Open Database License (ODbL). Attribution is
also shown in the app next to the map action.
