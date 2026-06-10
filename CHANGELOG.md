# Changelog

All notable changes to U.S. Space Mission Control are documented here. Dates use
the release ordering; the project follows a simple semantic-style versioning.

## v3.2.0 — Provider Expansion & Mission Tools
- ULA (United Launch Alliance) support — tab, overview tile, badges, filters, demo data, tests
- Firefly Aerospace support — tab, overview tile, badges, filters, demo data, tests
- Responsive provider navigation (horizontally scrollable tab strip on narrow screens)
- Date-range filter (next 24 hours / 7 days / 30 days / this year)
- Launch-site filter (Cape Canaveral, Kennedy, Vandenberg, Wallops, Rocket Lab LC-1, other)
- Orbit filter (LEO, SSO, GTO, GEO, MEO, polar, lunar, interplanetary, suborbital, unknown)
- Launch-site time mode (uses the pad timezone when available, with an honest fallback)
- Add-to-calendar `.ics` downloads (client-side, no dependency, UTC timestamps)
- Shareable mission deep links (`?mission=<id>`, copy link, auto-open, Back-button aware)
- Expanded Mission Insights (now ten metrics, including providers represented)
- About this data panel (sources, counts, status, tracked organizations)
- Mission status legend
- GitHub Actions validation workflow (plain Node, no package manager)

## v3.1.0 — Rocket Lab & Mission Insights
- Rocket Lab provider support
- Mission Insights
- keyless OpenStreetMap pad maps
- honest webcast-availability styling
- neutral fallback imagery
- More menu and pagination fixes

## v3.0.0 — U.S. Space Mission Control
- rebrand from SpaceX Mission Control
- NASA, SpaceX, and Blue Origin support
- organization tabs and overlap model
- mission overview redesign
- improved modal and saved drawer

## v2.1.1 — Final SpaceX Mission Control Hotfix
- random mission behavior fix
- synchronized status countdown

## v2.1.0 — UI Overhaul & Weather
- major UI overhaul
- Open-Meteo weather
- Fahrenheit and Celsius display
- modal, drawer, pagination, and polish

## v2.0.0 — Modular Refactor
- native ES-module architecture
- split stylesheets
- recruiter-facing documentation

## v1.0.0 — Initial AP CSP Project
- original SpaceX launch tracker
