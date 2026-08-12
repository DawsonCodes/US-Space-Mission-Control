# Animation catalog

Every animation in U.S. Space Mission Control is numbered `ANIM-nn`, tagged in
the source with the same id, and listed here.

**Ground rules for all of them**

- Only `transform` and `opacity` animate (compositor-friendly, no layout thrash).
- Timings come from the motion tokens in `styles/base.css`
  (`--motion-fast` 140ms · `--motion-normal` 220ms · `--motion-slow` 360ms ·
  `--motion-emphasis` 520ms) with the shared easings
  (`--ease-standard`, `--ease-out`, `--ease-spring`).
- Staggers are **capped** so a long list never feels slow.
- Everything is neutralised by the global `prefers-reduced-motion: reduce` rule,
  and decorative layers (sheens, spinners, overlays) are removed outright.
- Nothing blocks clicks, keyboard input, or screen-reader output.

| # | Name | Where | Trigger | Duration / easing | Reduced motion |
|---|------|-------|---------|-------------------|----------------|
| **ANIM-01** | Boot: shimmer → Loading → Loaded → hand-off | `js/boot.js`, `.boot` | First load in a tab | 420ms in · ≥3s shimmer+loading · 700ms Loaded · 620ms FLIP | Skipped entirely |
| **ANIM-02** | Section reveal stagger | `.is-booted .shell > *` | After the boot hand-off | `--motion-slow`, 70ms steps (capped 280ms) | No animation |
| **ANIM-03** | Launch-card entrance | `.motion-card-enter` | Fresh load & newly paginated cards | `--motion-normal`, `--stagger-step` (capped at 8) | No animation |
| **ANIM-04** | Card hover lift | `.launch-card:hover` | Pointer hover | `--motion-fast` | Instant state change |
| **ANIM-05** | Card media zoom | `.launch-card-media img` | Pointer hover | `--motion-slow` scale to 1.045 | No zoom |
| **ANIM-06** | Card press | `.launch-card:active` | Press / tap | `--motion-fast` | Instant |
| **ANIM-07** | Featured-mission transition | `.motion-spotlight-enter` | Spotlight mission changes | `--motion-slow` rise | No animation |
| **ANIM-08** | Legacy countdown pulse | `.details-countdown strong.is-ticking` | Plain-text countdown changes (passed/unknown launches) | `--motion-normal`, spring | No pulse |
| **ANIM-09** | Final-hour countdown glow | `.countdown-ring.is-final-hour` | < 1h to launch | 2.6s gentle loop | No glow |
| **ANIM-10** | Org pill active indicator | `.org-tab.is-active::after` | Organization selected | `--motion-normal` | Static indicator |
| **ANIM-11** | Overview tile hover bloom | `.overview-tile.is-org::after` | Pointer hover | `--motion-normal` | Layer removed |
| **ANIM-12** | Count roll-up + bump | `js/render.js`, `.is-bumped` | Tile counts change | 320ms roll + `--motion-normal` bump | Final value set instantly |
| **ANIM-13** | Insights chip cascade | `.insights-body.is-revealing` | Section **opened** (not re-render) | `--motion-normal`, 30ms steps (capped 150ms) | No animation |
| **ANIM-14** | Button sheen sweep | `.btn::after` and friends | Pointer hover | `--motion-emphasis` | Layer removed |
| **ANIM-15** | Button press | `.btn:active` | Press / tap | `--motion-fast` | Instant |
| **ANIM-16** | Save confetti | `.confetti-bit`, `js/main.js` | Mission saved | 640ms burst, 10 particles | Skipped entirely |
| **ANIM-17** | Saved-card collapse | `.saved-card.is-removing` | Removed from the drawer | `--motion-normal` | Removed immediately |
| **ANIM-18** | Status banner lifecycle | `.status`, `.status-progress` | Status message shown | 10s timer, 200ms exit | Timer kept, motion dropped |
| **ANIM-19** | Random-mission flash | `.launch-card.is-flash` | Random mission picked | `--motion-emphasis` ×2 | No flash |
| **ANIM-20** | Modal open | `.modal-panel`, backdrop | Details / About / Legend / Colors | 280ms scale + fade | Instant |
| **ANIM-21** | Drawer slide | `.drawer-panel` | Saved drawer opened | 280ms | Instant |
| **ANIM-22** | Skeleton shimmer | `.placeholder-*` | Uncached load | 1.6s loop | Static blocks |
| **ANIM-23** | Refresh spinner | `.btn.is-refreshing::before` | Live request in flight | 700ms linear loop | Spinner hidden |
| **ANIM-24** | Starfield + shooting stars | `js/starfield.js` | Always (background) | Per-frame drift; streaks ~rare | Twinkle frozen, no streaks |
| **ANIM-25** | Typewriter search hint | `js/search-hint.js` | Search empty + unfocused | 65ms/char, 530ms caret | Static placeholder |
| **ANIM-26** | Select arrow rotate | `.select-wrap.is-open::after` | Dropdown open | 200ms | Instant |
| **ANIM-27** | Active-filter summary | `.active-filters` | A filter becomes active | `--motion-fast` rise | Instant |
| **ANIM-28** | Results fade | `.motion-fade-in` | Filter/organization change | `--motion-normal` | Instant |
| **ANIM-29** | Segmented countdown roll | `.cd-value.is-rolling` | Each changed D/H/M/S digit — hero, cards, details modal and saved drawer | `--motion-fast` roll-up | Digits update, no roll |
| **ANIM-30** | Refresh-window pulse | `.refresh-window[data-state="checking"] .refresh-window-dot` | An automatic data check is in flight | 1.4s opacity loop | No pulse, dot stays solid |
| **ANIM-31** | Debug toggle busy | `.debug-toggle.is-busy` | Debug data pressed, mirror not yet answered | 1.1s opacity loop | No pulse, label still changes |
| **ANIM-32** | Status toast float | `.status` | Any status message appears | 280ms slide-in, then a 5.5s drift loop | Appears instantly, no drift |

## Notes on the two most involved ones

### ANIM-01 — startup sequence

1. A full-screen charcoal overlay presents the product title.
2. A bright band sweeps across the glyphs (`background-clip: text` on a **tiled**
   moving gradient). The gradient tiles deliberately: with `no-repeat` the parts
   of the text outside the gradient box get no paint and vanish, which is exactly
   the "text disappears" bug this replaced. The letters stay readable in a dimmed
   tone and only the highlight moves.
3. A **Loading** row (spinner + label) fades in beneath the title.
4. The overlay holds until **both** ≥3s has elapsed **and** the app has called
   `signalBootReady()` (fired on first paint, and on load failure so a dead API
   can't trap anyone). A 9s cap bounds the wait.
5. The row confirms with a check and **Loaded**, holds ~700ms, then fades.
6. The title **FLIPs** home: the hero's computed
   font-size/width/alignment are copied onto the boot title first, so the glyph
   geometry matches and it lands pixel-accurately by pure translation — no
   width-ratio scaling, which distorted when the two wrapped differently.
7. `.is-booted` triggers the section reveal (ANIM-02).

The overlay draws no background slab of its own — only a soft vignette — so the
page's real gradient and the live starfield show straight through.

A small **gate script in `<head>`** applies the pre-boot state synchronously,
before the body paints. Without it the dashboard rendered for a frame and the
overlay visibly "popped" over it. The gate mirrors the same skip rules, and
carries its own failsafe release so a module that never loads can't leave the
page blank.

It is skipped for reduced motion, for `?mission=` deep links, and after the
first play in a tab (`sessionStorage`). It is click/key skippable, has a hard
failsafe timer, and the "hidden while booting" state is added by JS only — so
no-JS visitors and the test harness always see the dashboard.

### ANIM-29 — segmented countdown

Used by the featured mission, every launch card, the details modal and the saved
drawer (cards and the drawer get a `.is-compact` variant). Renders days / hours /
minutes / seconds as separate cells.
Each tick only rewrites and rolls the cells whose value actually changed, so the
seconds animate every second while the days sit still. The visible digits are
`aria-hidden`; an `.sr-only` text copy carries the value **without** an
`aria-live` region, so screen readers are never spammed once per second.
