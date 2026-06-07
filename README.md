# SpaceX Mission Control

A polished, cinematic SpaceX launch tracker built with plain HTML, CSS, and
JavaScript — live mission data, real-time countdowns, an in-app mission-details
view, a saved-missions drawer, and a local weather outlook, all wrapped in an
animated space-themed UI.

**🚀 Live demo:** <https://dawsoncodes.github.io/SpaceX-Mission-Control/>

## Features

- **Mission dashboard hero** — next-launch spotlight with a live countdown,
  rocket, pad/location, a compact data-source + last-updated indicator, and a
  refresh action.
- **Live launch data** — pulls upcoming SpaceX launches from the Launch
  Library 2 API.
- **Local weather outlook** — a keyless Open-Meteo forecast for the launch pad,
  shown on the hero and in mission details (never an official go/no-go forecast).
- **Mission-details modal** — full details for every mission (local + UTC times,
  rocket, pad, description, weather, launch probability when available, and
  validated Webcast / Official page / Wiki links).
- **Saved-missions drawer** — save launches to a slide-over shortlist that
  survives refreshes; remove individually or clear all.
- **Search** across mission name, rocket, location, and status.
- **Mission-type filters** (Starlink, Crew, Cargo, Starship, Transporter,
  Rideshare, Science, and more).
- **Sorting** by soonest, latest, mission name, or launch probability.
- **Progressive results** — a clear "Showing X of Y" count with **Load 12 more**
  and **Show all** instead of a confusing fixed limit.
- **Local time / UTC toggle** for every date and countdown.
- **Demo mode** so the full UI works even when the API is unavailable.
- **Smart caching** of launch and weather responses (sessionStorage) with
  request cancellation for snappy refreshes.
- **Cinematic starfield** background with parallax glow and shooting stars,
  polished hover/entrance animations, and full `prefers-reduced-motion` support.
- **Accessible overlays** — focus trap, Escape/backdrop close, focus
  restoration, and background scroll lock.
- **Responsive** layout: three cards per row on wide desktop, two on tablet,
  one on mobile.

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
styles/
  base.css            # Design tokens, reset, typography, starfield, a11y, keyframes
  layout.css          # Page shell, panels, grids, structural layout
  components.css      # Buttons, selects, cards, badges, overlays, weather, status
  responsive.css      # Breakpoints (1/2/3 columns, sticky toolbar, mobile sheets)
js/
  config.js           # Constants (API URLs, storage keys, TTLs, reveal sizes)
  state.js            # Shared application state
  demo-data.js        # Offline/demo missions (always future-dated)
  storage.js          # Preferences, favorites, and API cache persistence
  utils.js            # Escaping, URL safety/validation, date/countdown formatting
  api.js              # Live fetch (caching + cancellation) + payload normalization
  filters.js          # Keyword matching, sorting, filter pipeline
  weather.js          # Open-Meteo fetch, nearest-hour, caching, formatting
  modal.js            # Accessible overlay mechanics (focus trap, ESC, scroll lock)
  render.js           # DOM references and all rendering (incl. overlay content)
  starfield.js        # Animated canvas background
  main.js             # Composition root: wires events and boots the app
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

No installation or build step is required — what you see is what ships.

## Data sources

- Upcoming launch data is provided by the
  [Launch Library 2](https://thespacedevs.com/llapi) API by The Space Devs.
- The local weather outlook is provided by the free, keyless
  [Open-Meteo](https://open-meteo.com/) forecast API. Weather is fetched only for
  the next-launch hero card and the open mission-details view (never for every
  card), cached briefly in `sessionStorage`, and is **not** an official launch
  go/no-go forecast.

## Project background

This project began as an **AP Computer Science Principles** semester final
project, where it earned a **100/100**. It has since been refactored and
polished into a public, recruiter-facing portfolio piece — modularized into ES
modules and split stylesheets while staying deliberately framework-free and easy
to deploy.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
guidelines on branches, local testing, and keeping the project dependency-free.

## License

Released under the [MIT License](LICENSE).
