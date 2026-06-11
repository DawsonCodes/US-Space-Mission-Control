# Changelog

All notable changes to U.S. Space Mission Control are documented here. Dates use
the release ordering; the project follows a simple semantic-style versioning.

## v3.3.1 — Launch Stabilization

- Full mobile responsive repair: no page-level horizontal overflow or forced
  zoom-out; long mission names/locations wrap; hero, modal, and saved drawer fit
  and scroll cleanly on small screens
- Redesigned hero organization selector into a clean wrapping layout (every
  provider always visible, no desktop horizontal scrolling, no clipped pill)
- Distinct, centralized organization color system (one accent family per
  organization) applied to pills, badges, on-image badges, and overview tiles
- Locally-saved organization-color customization with curated accessible swatches,
  live preview, Reset to defaults, and malformed-storage safety
- Typewriter-style animated search hint (stops on focus/typing, pauses while the
  tab is hidden, static placeholder for reduced motion)
- Mission Overview redesign: balanced responsive grid, clearer selected state,
  quieter overlap note, non-clipping labels
- API startup resilience: partial-success handling (one feed can fail without
  destroying the dashboard), honest partial-coverage and stale-cache messages, and
  a single bounded retry when the first uncached load fails
- Expanded plain-Node CI validation (org colors, search hint, API resilience,
  retry, stale-cache, duplicate-refresh, responsive audit)

## v3.3.0 — Interface, Motion & Performance Polish

- Premium visual refresh across the hero, overview, filters, cards, overlays, drawer, More menu, and footer
- Centralized CSS motion system with reduced-motion support
- Animated organization tabs, overview counts, Mission Insights, featured missions, result cards, and saved states
- Cache-first launch-data rendering with honest stale-data fallback
- Background live-data refresh
- Improved initial loading experience with skeleton states and progressive status messaging
- Status-banner synchronization hardening
- Responsive-layout audit for desktop, tablet, and mobile
- Accessibility polish
- CSS token cleanup
- Careful dead-code and unused-asset cleanup
- Expanded plain-Node GitHub Actions validation

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
