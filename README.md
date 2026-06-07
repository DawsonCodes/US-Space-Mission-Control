# SpaceX Mission Control

A polished, cinematic SpaceX launch tracker built with plain HTML, CSS, and
JavaScript — live mission data, real-time countdowns, filtering, sorting, and a
persistent favorites list, all wrapped in an animated space-themed UI.

**🚀 Live demo:** <https://dawsoncodes.github.io/SpaceX-Mission-Control/>

## Features

- **Live launch data** — pulls upcoming SpaceX launches from the Launch
  Library 2 API.
- **Next-launch hero card** with a live, ticking countdown.
- **Search** across mission name, rocket, location, and status.
- **Mission-type filters** (Starlink, Crew, Cargo, Starship, Transporter,
  Rideshare, Science, and more).
- **Sorting** by soonest, latest, mission name, or weather/probability.
- **Adjustable result limits** (6 / 12 / 24 / 48).
- **Favorites** saved to your browser, with a favorites-only view that survives
  refreshes.
- **Local time / UTC toggle** for every date and countdown.
- **Demo mode** so the full UI works even when the API is unavailable.
- **Smart caching** of API responses (sessionStorage) with request
  cancellation for snappy refreshes.
- **Cinematic starfield** background with parallax glow and shooting stars,
  plus full `prefers-reduced-motion` support.
- **Responsive** layout that reflows cleanly from mobile to widescreen.

## Tech stack

- **Vanilla JavaScript** organized as native **ES modules** — no framework, no
  TypeScript, no build step.
- **Modern CSS** — custom properties (design tokens), Grid, and Flexbox.
- **Canvas API** for the animated starfield.
- **localStorage / sessionStorage** for preferences, favorites, and caching.
- **Launch Library 2** REST API for live launch data.

## Project structure

```
index.html            # App shell (entry point, stays at repo root)
styles/
  base.css            # Design tokens, reset, typography, starfield, a11y
  layout.css          # Page shell, panels, grids, structural layout
  components.css      # Buttons, cards, badges, status, placeholders
  responsive.css      # Media-query overrides
js/
  config.js           # Constants (API URL, storage keys, cache TTL)
  state.js            # Shared application state
  demo-data.js        # Offline/demo missions (always future-dated)
  storage.js          # Preferences, favorites, and API cache persistence
  utils.js            # Escaping, URL safety, date/countdown formatting
  api.js              # Live fetch (with caching + cancellation) + normalization
  filters.js          # Keyword matching, sorting, filter pipeline
  render.js           # DOM references and all rendering
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

## Data source

Upcoming launch data is provided by the
[Launch Library 2](https://thespacedevs.com/llapi) API by The Space Devs.

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
