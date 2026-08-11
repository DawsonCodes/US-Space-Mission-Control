# Changelog

Release history for U.S. Space Mission Control, newest first.

## v3.5.0 — Automatic Data

The launch data no longer comes from each visitor's browser, and there is
nothing to press to update it.

- Fixed the dashboard showing NASA missions and nothing else. When the provider
  feed failed, the NASA feed was all that answered, and the app both rendered
  that as the full list and saved it to the cache. From then on every visit
  started NASA-only, before a single request was sent, until a complete load
  happened to succeed. A one-feed result is now never cached, and never replaces
  a more complete list already on screen or in the cache
- Removed the Refresh data button and Reload live data. Updating is automatic on
  a rolling 30-minute window, and the hero now shows where that window stands,
  for example "Updated 6 minutes ago. Next check in 24 minutes"
- Demo data is now Debug data and lives at the bottom of the page next to the
  credits, not in the More menu. It is a debugging aid, not a feature, and it
  toggles back off with no request
- Reloading the page no longer costs an API request. Reading the published data
  is free and always happens; falling back to the API only happens when there is
  nothing to show or what is shown is over an hour old. Before this, every
  reload spent two or three requests against a budget of fifteen an hour, so it
  was possible to be rate limited before finishing the first visit
- The data workflow also runs on a push to main, so a snapshot exists straight
  away instead of everyone using the API fallback until the next half hour

Launch Library 2 allows roughly 15 requests an hour per caller. Every visitor
calling it directly ran that out quickly, which is what caused the partial
lists, the "provider feed didn't respond" warnings and the outright failures
after a tab had been closed for a while.

- A workflow now runs twice an hour, fetches every upcoming launch, and commits
  the result as plain JSON under `data/`. The dashboard loads that from its own
  origin, so no visitor makes a launch API request and no one can be rate
  limited
- Because the workflow runs on a schedule instead of per visitor, it pages each
  feed until it is exhausted rather than stopping at 200, so the list is
  complete instead of partial
- It also retries a feed that fails, so one bad response no longer leaves
  everyone with a short list until the next run
- The page refreshes itself every 30 minutes, and when you return to a tab that
  has been in the background. No more pressing Refresh to find out what changed
- Both ends skip work when nothing changed. The page sends a conditional
  request, so an unchanged snapshot comes back as a 304 with no data
  transferred, and an automatic refresh that finds nothing new leaves the page
  completely alone. The workflow commits nothing when the data is identical
- Saved data still paints immediately, so the dashboard is never empty while it
  checks for an update
- Calling the API directly remains as a fallback for a fresh fork, a local
  checkout, or a workflow that has stopped running, and keeps its rate-limit
  handling
- Launch normalization moved into its own module so the workflow and the browser
  produce byte-identical results
- Added screenshots to the README and rewrote the data section
- The project audit now fails on a constant that is used but never imported.
  That exact mistake, a missing import, silently disabled the whole snapshot
  path during development and only showed up as a fallback to the old behaviour
- Added four test suites: snapshot validation and fallback order, the scheduled
  workflow script, the promise that a visitor makes no API request, and the
  updated refresh flow

## v3.4.3 — Previous Launch Details, Accents & Cleanup

- Previous launches now open a full detail view with the mission description,
  rocket, pad, orbit, agencies, outcome, published cause and a pad map
- Added the weather recorded at liftoff to that view, from Open-Meteo. It is
  fetched once per launch and stored with it, so reopening a launch costs
  nothing and the weather source is barely touched
- The Previous launches panel is now a rolling window of the 20 most recent
  completed launches. A new launch enters the top, the oldest drops off, and its
  stored weather goes with it, so the saved data cannot grow
- Launch cards, saved missions and previous launches now carry a coloured edge
  for the organization flying them. A mission shared by two organizations splits
  the edge into a band for each, so a NASA payload on a SpaceX rocket reads as
  both at a glance
- Redesigned the saved missions drawer. Soonest first, launches that already
  flew sink to the bottom and are labelled, a count of what is still ahead, a
  quieter remove control and a clearer empty state
- Launch feeds are now paged. Launch Library 2 returns at most 100 records per
  request, so a feed with more than that follows one extra page and covers up to
  200 upcoming launches instead of 100
- Coverage messages now say how many launches are shown rather than just calling
  the list partial
- Stopped refreshing launch data on every tab open when the cache is less than
  15 minutes old. Launch Library allows about 15 requests an hour and the app
  was spending that allowance re-fetching launches that had not moved, which is
  what left the live API failing on reopen. Refresh data is still one click away
- The app now recognises being rate limited and says so, with how long is left,
  instead of showing a generic failure. It stops asking until the limit clears,
  keeps showing cached launches and the stored previous window, and hides the
  retry button when retrying cannot help
- A failed extra page no longer discards the page already fetched
- Mission details and previous-launch details now show the mission or rocket
  image, filling the empty space in the modal
- Fixed the split accent edge rendering as one colour. The solid single-colour
  rule out-specified the gradient, so a shared mission never showed its split
- Fixed the back button in previous-launch details stretching the full width of
  the panel and running under the close button
- Cut duplicated and low-value text from the dashboard, including the
  organization note that repeated the tab strip directly above it
- Rewrote the README and this changelog to be shorter and plainer
- Added seven test suites covering feed paging, the rolling store, accent edges,
  the saved drawer, the fresh-cache request budget, rate-limit handling and the
  stylesheet rule that the accent bug slipped past

## v3.4.2 — Startup Polish & Previous Launches

- Fixed the dashboard flashing on screen before the loading overlay appeared. A
  head gate applies the pre-boot state before first paint, so the title screen is
  the first thing you see
- The boot overlay now uses the real starfield background instead of a flat
  panel
- The startup sequence confirms with "Loaded" under the title, then flies the
  title into its dashboard position
- Added a Previous launches panel to the More menu, with a Success, Partial
  failure or Failure outcome, the published cause when something went wrong, and
  a link to watch the launch back
- Fixed "Partial Failure" being read as a plain failure, since the label
  contains the word failure
- Detail modals are wider on desktop with a three-column grid from 900px up.
  Mobile keeps its full-screen sheet

## v3.4.1 — Controls, Motion & Startup

- Buttons are now a solid graphite system with no gradients or blue tints.
  Primary keeps its hierarchy through a lighter step of the same gray
- Organization tiles blend their accent into the charcoal instead of filling
  with flat colour, so NASA reads as a light rose wash rather than a red block
- Added the startup sequence. The title shimmers, a loading spinner holds for at
  least three seconds, then the title flies into the hero and the dashboard
  reveals in a stagger. Skipped for reduced motion, deep links and repeat visits
- The shimmer no longer makes the title vanish. The gradient tiles, so every
  glyph stays painted and only the highlight moves
- Countdowns everywhere now show days, hours, minutes and seconds with per-digit
  roll animations. Cards dropped the vague "in 22 days" label for it
- Save keeps its green pill, the star turns gold and fires a confetti burst, the
  button no longer jumps, and the saved count updates instantly
- Fixed launch-card image distortion on hover. Nested transforms were forcing
  bitmap resampling; the image now gets its own compositor layer
- Fixed Mission Insights chips replaying their entrance on every keystroke
- Fixed overview counts animating up from a stale dataset after a reload
- Fixed the button hover sheen snapping back to the right at the end
- Fixed long select labels clipping, and the typewriter search hint truncating
  to an unreadable ellipsis
- Full animation pass, 29 animations catalogued in ANIMATIONS.md

## v3.4.0 — Theme Polish

- Reworked the background into a black, charcoal and graphite space theme with
  much less blue wash
- Subtler gray starfield with infrequent shooting-star streaks, frozen under
  reduced motion
- Fixed search and input text clipping with an explicit line height and fixed
  input height
- Fixed a long-standing pagination bug where Load more and Show all failed to
  hide, because the HTML hidden attribute was overridden by the button display
  rule. The empty pagination row now collapses too
- Added pagination and theme test suites

## v3.3.1 — Launch Stabilization

- Full mobile repair. No horizontal overflow or forced zoom-out, long names
  wrap, and the hero, modal and drawer fit and scroll cleanly
- Redesigned the hero organization selector into a wrapping layout, so every
  provider is visible with no horizontal scrolling or clipped pills
- Added a distinct colour per organization across pills, badges and tiles
- Added organization colour customization with curated accessible swatches,
  live preview and a reset, saved on the device
- Added the typewriter search hint, which stops on focus and pauses when the tab
  is hidden
- Redesigned Mission Overview with a balanced grid and non-clipping labels
- Hardened startup. One feed can fail without breaking the dashboard, stale
  cache stays usable with an honest notice, and a failed first load retries once
- Expanded CI validation

## v3.3.0 — Interface, Motion & Performance

- Visual refresh across the hero, overview, filters, cards, overlays, drawer,
  More menu and footer
- Added a centralized CSS motion system with full reduced-motion support
- Animated organization tabs, overview counts, insights, featured missions,
  result cards and saved states
- Added cache-first launch data with an honest stale-data fallback and a
  background refresh
- Added skeleton loading states and progressive status messaging
- Hardened status-banner synchronization
- Responsive audit, accessibility polish and CSS token cleanup
- Removed dead code and unused assets
- Expanded CI validation

## v3.2.0 — Provider Expansion & Mission Tools

- Added ULA and Firefly Aerospace, with tabs, tiles, badges, filters and demo
  data
- Added a scrollable provider tab strip for narrow screens
- Added date range, launch site and orbit filters
- Added launch-site time mode, using the pad timezone when available
- Added calendar file downloads, generated client-side
- Added shareable mission deep links that are Back-button aware
- Expanded Mission Insights to ten metrics
- Added the About this data panel and the mission status legend
- Added the GitHub Actions validation workflow

## v3.1.0 — Rocket Lab & Mission Insights

- Added Rocket Lab
- Added Mission Insights
- Added keyless OpenStreetMap pad maps
- Added honest webcast availability styling and neutral fallback imagery
- Fixed the More menu and pagination

## v3.0.0 — U.S. Space Mission Control

- Rebranded from SpaceX Mission Control
- Added NASA and Blue Origin alongside SpaceX
- Added organization tabs and the overlap model
- Redesigned Mission Overview, the modal and the saved drawer

## v2.1.1 — Final SpaceX Mission Control Hotfix

- Fixed random mission behavior
- Synchronized the status countdown

## v2.1.0 — UI Overhaul & Weather

- Major UI overhaul
- Added Open-Meteo weather in Fahrenheit and Celsius
- Modal, drawer and pagination polish

## v2.0.0 — Modular Refactor

- Moved to native ES modules and split stylesheets
- Added recruiter-facing documentation

## v1.0.0 — Initial AP CSP Project

- The original SpaceX launch tracker
