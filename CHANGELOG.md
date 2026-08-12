# Changelog

Release history for U.S. Space Mission Control, newest first.

## v3.7.2 — Fixes

- Fixed "Partial" and the drop back to the launch API. The published file is
  only rewritten when the launch data actually changes, so its timestamp is the
  last time something moved, routinely many hours ago even though the workflow
  ran twenty minutes back. Judging the file by that age threw away a complete
  226-launch list and sent every visitor to the API for a truncated 206, which
  is the opposite of the point. A file that exists and validates is now used
  whatever its age; the age is reported, not acted on
- The status message sits still. The drift loop read as jitter rather than as
  floating, so it slides in, stays put, and slides out
- Launch photos fill the frame again. Showing them whole over a blurred copy of
  themselves shrank the rocket to the middle third and let the blurred bars
  dominate the card. The frames are taller instead, so cropping takes less
- Mission patches are no longer used as the picture. A patch is a circular logo,
  so cards that should have shown a rocket showed a Starlink roundel
- A split accent edge is the same weight as a single one. It was wider and
  brighter so the division would read, which made a shared mission shout next to
  its neighbours

## v3.7.1 — Aligned Checks

- The page now checks for new data on the workflow's own schedule rather than on
  a timer started when the tab opened. A tab opened at five past next looked at
  ten past the half hour, five minutes after the data had already been
  republished, and sat reading "due now" in between. Every tab now checks just
  after each scheduled publish, so they all agree
- The countdown reads from that schedule too. It was derived from the age of the
  data, but a run that finds nothing changed publishes nothing, so the age keeps
  growing while the next check is still minutes away and the countdown parked on
  "due now". Age and countdown are now two separate facts
- Restored four fixes that were left behind. They were pushed to the v3.6.0
  branch after that pull request had already been merged, so they never reached
  the site: the saved-copy schema bump, completed launches no longer being judged
  by the upcoming-data staleness rule, the guard that stops a scheduled update
  cancelling debug mode, and the oversized title wash that keeps descenders
  painted

## v3.7.0 — Presentation Polish

- Launch photos are shown whole instead of cropped. Launch Library's pictures
  are mostly tall shots of a rocket on the pad, and fitting them to a short
  landscape strip cut the vehicle in half. The picture now sits over a blurred
  copy of itself, so it still fills the frame
- More variety in those pictures. Launch Library's launch image is nearly always
  the rocket-configuration photo, so a hundred Falcon 9 flights all showed the
  same one. Mission patches, pad photos and program images are now used when
  they exist, in that order, with the shared rocket photo as the last resort
- Fixed a split accent edge reading as one colour. On hover the whole border was
  being tinted with the first accent and the split ring was drawn on top of it,
  so the lower half looked like the first colour showing through. There is also
  a hard divider between the bands now, because NASA's rose is much brighter
  than any provider colour and bled across an exact half
- Status messages are a floating panel in the corner rather than a strip in the
  toolbar, where they scrolled out of view and were missed. They drift gently,
  stay above everything, and have a real close button
- Random mission opens the mission it picked. Scrolling to a highlighted card
  asked you to work out what had been chosen, and on a long list the highlight
  was often off-screen by the time the scroll finished
- Removed Reset filters from the More menu; the toolbar already has it
- Detail views are wider and taller on desktop, with a fourth column of facts on
  a large screen, so they usually fit without scrolling
- Visibility, wind and gusts read in miles and mph first, then metric, matching
  how temperature has always been shown
- Fixed the saved drawer's scrollbar flashing in and out when a mission is
  removed, which shifted the list sideways

## v3.6.1 — The Snapshot Actually Publishes

- Fixed the reason no published data ever appeared. The workflow ran eight times
  and succeeded eight times, wrote both files, then asked git whether anything
  had changed using a check that only looks at tracked files. The data directory
  was brand new and untracked, so the answer was always no and the files were
  discarded. Every visitor was falling through to the API because there was
  nothing to read. It now stages first and asks the index
- The completed-launch feed is no longer paged. Launch Library reports over a
  thousand completed launches in its count even though the query asks for
  twenty, so paging walked backwards through history we throw away and spent
  most of the run budget doing it, which then starved the upcoming feed
- With that budget freed, the upcoming list is published whole. The note about
  a few of the furthest-out launches not being listed should stop appearing
- Weather recorded at a past launch is now fetched by the workflow and published
  with the launch, so every visitor reads the same stored reading instead of
  each browser looking it up. It is carried forward between runs, so a launch is
  looked up once and never again
- Fixed the startup title flashing solid white before the animation began. The
  gradient arrived with a class added 420ms in; the resting colour now matches
  the tone the glow sweeps over, so only the highlight switches on
- The split accent edge has square ends. The rounded left corners were tapering
  whichever band sat at the top and bottom, which made a two-band split look
  lopsided, and the hover ring is stronger so neither colour is washed out
- The saved-data notice is amber rather than blue. It is a caveat, not neutral
  information
- Fixed selects staying brightly ringed after use. Chromium treats a mouse click
  on a select as keyboard focus, and focus stays on the control after the popup
  closes, so the ring sat there looking like a stuck open state. The loud ring
  now belongs to the open state; focus keeps a quieter one
- Fixed a launch card staying highlighted after its details modal closed. Focus
  is deliberately restored to the button inside the card, which plain
  focus-within matched forever
- Collapsing Mission insights is now remembered on your device, instead of
  springing back open on the next visit

## v3.6.0 — Sync, Timing & API Accounting

- Fixed the NASA-only dashboard, again, at its remaining source. The development
  mirror was standing in when production was refused, and when one of its feeds
  came back short the result was every NASA mission and nothing else, labelled
  as published data. The mirror is no longer a fallback of any kind: it is
  reached only when the Debug data button is pressed
- The scheduled workflow now refuses to publish a snapshot whose provider feed
  returned nothing, so a NASA-only list cannot be shipped to everyone either
- The update countdown is anchored to when the data was published rather than to
  when the tab opened, so it reads the same in every tab and continues across a
  reload instead of restarting at thirty minutes. The publish time travels
  through the saved copy, so even the first paint of a reload is correct
- Fixed the saved-data banner flashing and vanishing. Withholding an API request
  counted as a failure and dismissed the banner a few hundred milliseconds after
  raising it. It now settles on a final wording instead
- A banner raised during startup no longer spends its ten seconds behind the
  boot overlay: the countdown is held until the dashboard is actually visible
- Debug data responds immediately. The button shows a pressed and loading state
  before any network work starts, and gives up on the mirror after five seconds
  instead of the fifteen-second page timeout
- Debug messages have their own amber, dashed style rather than looking like
  ordinary information
- Completed launches now ride the same 30-minute cycle as everything else,
  reading the published file in the background, so opening the panel shows
  current data rather than fetching on demand. That background read never spends
  an API request
- The accent edge leads with NASA, so a shared mission reads rose over the
  provider's colour, and hovering keeps both colours instead of collapsing the
  border to one
- Fixed the startup glow starting on top of the title. A tiled gradient always
  has a copy over the glyphs, so it could never begin off-text; the glow is now
  a separate non-repeating layer over a flat base, starting fully clear of the
  left edge
- Every API request is now counted and published. The About panel reports what
  the scheduled run spent, what that works out to per hour against the
  allowance, and how many requests this browser has made, which should be zero
- The workflow will not exceed a seven-request budget per run. If a feed grows
  past that it stops paging, reports the list as truncated and says so in the
  log rather than quietly spending the next run's allowance
- The project audit now imports every module under a DOM shim, so a missing
  function reference fails the build. Two such bugs reached the browser during
  development because `node --check` cannot see them

Four further gaps, found by reviewing the fixes above rather than by using them:

- The saved-copy schema was bumped. A copy written before the publish stamp
  existed still validated, so it fell back to the local save time and read
  "just now" on every reload, which is the bug the stamp exists to fix
- Completed launches are no longer judged by the upcoming-data staleness rule.
  The workflow leaves that file untouched when nothing has changed, so its
  timestamp is the last time a provider actually flew, routinely days old.
  Treating that as stale sent the panel to the API on open
- Pressing Debug now claims debug mode before any network work. It was only
  claimed once the data painted, so a scheduled update landing during the wait
  could repaint over it and drop you back out with no message
- The startup title's base wash is oversized rather than exactly the text box.
  Line height is smaller than the font's content area, so a descender could fall
  outside a box-sized wash and lose its paint

## v3.5.3 — Development Mirror

- Debug data now pulls real missions from The Space Devs' development mirror at
  lldev, which they run for exactly this purpose and which is not meaningfully
  rate limited. The bundled sample missions remain as the offline fallback, so
  the switch still works with no network
- That mirror also stands in when the production API has refused us and there is
  nothing else to show. It serves a cached dataset that can be days behind, so
  it is labelled wherever it appears and is never written to the launch cache
- Production is still preferred whenever it answers, and the published snapshot
  is still preferred over both

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
