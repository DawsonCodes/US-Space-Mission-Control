# U.S. Space Mission Control

A polished, cinematic U.S. spaceflight dashboard built with plain HTML, CSS, and
JavaScript — track upcoming **NASA missions, SpaceX launches, Blue Origin
flights, Rocket Lab launches, ULA launches, and Firefly launches** with live
countdowns, an in-app mission-details view, a saved-missions drawer, and a local
weather outlook, all wrapped in an animated space-themed UI.

**🚀 Live demo:** <https://dawsoncodes.github.io/US-Space-Mission-Control/>

## Organizations: an agency vs. providers

The dashboard intentionally tracks six organizations — and models them
honestly:

- **NASA** is a civil space **agency**, matched on a mission's agencies. NASA
  missions frequently fly on commercial rockets.
- **SpaceX**, **Blue Origin**, **Rocket Lab**, **ULA** (United Launch Alliance),
  and **Firefly** (Firefly Aerospace) are launch **providers**, matched on the
  launch service provider.

Because of that, organization views overlap on purpose:

- A NASA mission may launch on a SpaceX rocket → it appears under **both** NASA
  and SpaceX.
- A NASA payload may launch on a Rocket Lab Electron → NASA **and** Rocket Lab.
- A NASA payload may launch on a ULA Vulcan → NASA **and** ULA.
- A NASA payload may launch on a Firefly Alpha → NASA **and** Firefly.
- A SpaceX Starlink launch (or a commercial ULA / Firefly launch) is a provider
  launch but not a NASA mission.
- A Blue Origin New Shepard flight is a Blue Origin flight and is **suborbital**.

The organization-overview counts can overlap and are not expected to add up to
the total — for example, 17 NASA missions and 7 ULA launches may share a mission
between them. There is no "other providers" view — the product stays focused on
NASA, SpaceX, Blue Origin, Rocket Lab, ULA, and Firefly.

## Features

- **Organization tabs** — *All tracked missions · NASA · SpaceX · Blue Origin ·
  Rocket Lab · ULA · Firefly*, the primary organization filter, kept in sync with
  the clickable overview tiles. The tab strip scrolls horizontally on narrow
  screens instead of wrapping.
- **Featured-mission spotlight** — the next matching mission for the active
  organization + filters, with organization, mission-type, and orbital/suborbital
  badges, a live countdown, rocket/pad, launch-site weather, and quick actions.
- **Mission overview** — *Showing · NASA missions · SpaceX launches · Blue Origin
  flights · Rocket Lab launches · ULA launches · Firefly launches · Saved* tiles;
  every tile is clickable (organization tiles switch views, Showing returns to
  All tracked missions, and Saved opens the drawer).
- **Mission insights** — a compact, collapsible strip of counts for the current
  filtered view (launches in the next 7 and 30 days, webcasts, orbital/suborbital,
  crew, science, active launch sites, weather outlooks, providers represented) —
  never all-time statistics.
- **Live launch data** — pulls upcoming launches from the Launch Library 2 API
  using two feeds (SpaceX + Blue Origin + Rocket Lab + ULA + Firefly providers,
  and NASA-tagged missions), merged and de-duplicated by stable launch id with a
  conservative field-level merge.
- **Filtering** — organization, search, mission type, flight type, **date range**
  (next 24 h / 7 days / 30 days / this year), **launch site**, and **orbit**, all
  combining cleanly. Changing a filter resets pagination; changing the time mode
  does not.
- **Time modes** — Local time, UTC, and **Launch-site time** (uses the pad
  timezone when available, with an honest fallback to local time).
- **Add to calendar** — download a standards-friendly `.ics` event for any launch
  with a confirmed time (client-side Blob, UTC timestamps, no dependency).
- **Shareable mission links** — *Copy mission link* produces a `?mission=<id>`
  deep link (project-subpath-safe). Opening such a link auto-opens the mission;
  the Back button and closing the modal clean the URL up again.
- **Orbital + suborbital support** — Blue Origin New Shepard suborbital flights
  are included; flight type is shown honestly (orbital / suborbital / omitted
  when unknown).
- **Local weather outlook** — a keyless Open-Meteo forecast for the launch pad,
  shown on the spotlight and in mission details (never an official go/no-go
  forecast).
- **Mission-details modal** — local + UTC + launch-site times, provider, mission
  agencies, orbit, rocket, pad, description, weather, launch probability, a pad
  map, Add to calendar, Copy mission link, and validated Webcast / Official page
  / Wiki links.
- **About this data & status legend** — the **More** menu opens a compact About
  panel (sources, loaded/filtered counts, refresh time, data status, tracked
  organizations) and a plain-language mission status legend.
- **Keyless launch-pad maps** — when LL2 provides valid pad coordinates, the
  details modal offers an "Open pad map" action linking to OpenStreetMap in a
  new tab. No map SDK, no API key, and no map request until you click.
- **Honest webcast styling** — a validated webcast URL shows "Webcast
  available"; inside a near-launch window it becomes "Check live webcast" with a
  restrained pulse. The UI never claims a stream is LIVE, because Launch
  Library 2 provides a URL, not a live state.
- **Neutral no-image placeholders** — when LL2 has no usable image, cards show a
  quiet "No mission image available" panel instead of illustrated stand-in art.
- **Saved-missions drawer** — ☆ Save / ★ Saved, a red **× Remove**, and a
  red-outline **Clear all**; saved missions survive refreshes.
- **Search** across mission name, rocket, location, status, provider, and agency.
- **Filters** — an evidence-based mission-type taxonomy (Crew, Cargo, Science,
  Starlink, Rideshare, Commercial, National security, Test flight, …), a
  flight-type filter, and sorting by soonest, latest, name, highest probability,
  or recently updated.
- **Progressive results** — 10 cards initially with **Load 10 more** / **Show
  all**, shown only while more matching results remain.
- **Demo mode** (under the **More** menu) so the full UI works even when the API
  is unavailable, with future-dated records covering NASA, SpaceX, Blue Origin,
  Rocket Lab, ULA, and Firefly; crew/cargo/science/national-security/rideshare;
  orbital/suborbital/unknown orbits; multiple launch-site time zones; overlapping
  NASA-on-provider missions; and intentionally malformed records to exercise
  graceful degradation.
- **Smart caching** of launch and weather responses (sessionStorage) with request
  cancellation, comfortably inside Launch Library 2's request budget.
- **Cinematic starfield** background, polished animations, and full
  `prefers-reduced-motion` support.
- **Accessible** overlays (focus trap, Escape/backdrop close, focus restoration),
  ARIA-labelled tabs/tiles, and keyboard navigation.
- **Responsive** layout: three cards per row on wide desktop, two on tablet, one
  on mobile.

## Tech stack

- **Vanilla JavaScript** organized as native **ES modules** — no framework, no
  TypeScript, no build step.
- **Modern CSS** — custom properties (design tokens), Grid, and Flexbox.
- **Canvas API** for the animated starfield.
- **localStorage / sessionStorage** for preferences, favorites, and caching.
- **Launch Library 2** REST API for live launch data.
- **Open-Meteo** free, keyless forecast API for the local weather outlook.

## Project structure

```
index.html            # App shell (entry point, stays at repo root)
favicon.svg           # Lightweight inline SVG favicon
assets/
  images/
    ATTRIBUTION.md    # Image + map source and reuse documentation
styles/
  base.css            # Design tokens, reset, typography, starfield, a11y, keyframes
  layout.css          # Page shell, panels, grids, structural layout
  components.css      # Buttons, selects, tabs, tiles, cards, badges, overlays, status
  responsive.css      # Breakpoints (1/2/3 columns, sticky toolbar, mobile sheets)
js/
  config.js           # Constants (LL2 URLs + provider IDs, storage keys, TTLs)
  state.js            # Shared application state
  demo-data.js        # Offline/demo missions (always future-dated)
  storage.js          # Preferences, favorites, API cache + one-time key migration
  utils.js            # Escaping, URL safety, date/countdown/timezone formatting
  api.js              # Two-feed fetch + normalize + conservative merge/dedupe
  organizations.js    # Org / mission-type / flight-type / orbit / site / status
  images.js           # Launch-image resolver (LL2 first, then neutral placeholder)
  filters.js          # Keyword, date-range, launch-site, orbit, sorting pipeline
  calendar.js         # Client-side .ics calendar generation
  deeplink.js         # Shareable ?mission=<id> URL helpers
  weather.js          # Open-Meteo fetch, nearest-hour, caching, formatting
  modal.js            # Accessible overlay mechanics (focus trap, ESC, scroll lock)
  render.js           # DOM references and all rendering (incl. overlay content)
  starfield.js        # Animated canvas background
  main.js             # Composition root: wires events and boots the app
tests/
  check-project.mjs        # Import resolution + relative-path / no-build audit
  classification.test.mjs  # Org / mission-type / flight-type / orbit / site rules
  merge.test.mjs           # Conservative two-feed merge / dedupe
  calendar.test.mjs        # .ics escaping, UTC stamps, UID, filename, content
  deeplink.test.mjs        # Mission deep-link build / parse / strip (subpath-safe)
  headless.test.mjs        # DOM-shim boot + render pipeline harness
.github/
  workflows/validate.yml   # GitHub Actions: plain-Node validation (no npm)
```

## Local setup

Because the app uses ES modules, it must be served over `http://` (opening the
file directly with `file://` will not work). From the project root:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000/
```

```bash
# or, with Node installed
npx serve .
```

No installation or build step is required — what you see is what ships. The
plain-Node checks (also run in CI via `.github/workflows/validate.yml`) need no
dependencies:

```bash
node tests/check-project.mjs
node tests/classification.test.mjs
node tests/merge.test.mjs
node tests/calendar.test.mjs
node tests/deeplink.test.mjs
node tests/headless.test.mjs
```

## GitHub Pages

The site is served from the repository root under a project path
(`https://dawsoncodes.github.io/US-Space-Mission-Control/`), so all asset paths
are **relative** (`js/main.js`, `styles/base.css`, `assets/images/...`). Never
use leading-slash absolute paths (`/js/main.js`), and keep `index.html` at the
repository root.

## Data sources

- Upcoming launch data is provided by the
  [Launch Library 2](https://thespacedevs.com/llapi) API by The Space Devs.
  SpaceX + Blue Origin + Rocket Lab + ULA + Firefly launches and NASA-tagged
  missions are fetched as two feeds and merged by stable launch id.
- The local weather outlook is provided by the free, keyless
  [Open-Meteo](https://open-meteo.com/) forecast API. Weather is fetched only for
  the featured-mission spotlight and the open mission-details view (never for
  every card), cached briefly in `sessionStorage`, and is **not** an official
  launch go/no-go forecast.
- Launch images come from Launch Library 2 first; when none is available, a
  neutral "No mission image available" placeholder is shown instead of stand-in
  artwork (see [`assets/images/ATTRIBUTION.md`](assets/images/ATTRIBUTION.md)).
- Launch-pad map links open [OpenStreetMap](https://www.openstreetmap.org/)
  externally — map data © OpenStreetMap contributors. The app itself makes no
  map requests.

## Project background

This project began as an **AP Computer Science Principles** semester final
project, where it earned a **100/100**. It has since grown from a SpaceX-only
tracker into a broader, recruiter-facing portfolio dashboard covering U.S.
spaceflight (NASA, SpaceX, Blue Origin, Rocket Lab, ULA, and Firefly) —
modularized into ES modules and split stylesheets while staying deliberately
framework-free and easy to deploy.

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
guidelines on branches, local testing, and keeping the project dependency-free.

## License

Released under the [MIT License](LICENSE).
