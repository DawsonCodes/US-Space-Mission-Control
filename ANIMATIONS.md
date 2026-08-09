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
| **ANIM-01** | Boot title shimmer + hand-off | `js/boot.js`, `.boot` | First load in a tab | 420ms in · 1150ms shimmer · 620ms FLIP | Skipped entirely |
| **ANIM-02** | Section reveal stagger | `.is-booted .shell > *` | After the boot hand-off | `--motion-slow`, 70ms steps (capped 280ms) | No animation |
| **ANIM-03** | Launch-card entrance | `.motion-card-enter` | Fresh load & newly paginated cards | `--motion-normal`, `--stagger-step` (capped at 8) | No animation |
| **ANIM-04** | Card hover lift | `.launch-card:hover` | Pointer hover | `--motion-fast` | Instant state change |
| **ANIM-05** | Card media zoom | `.launch-card-media img` | Pointer hover | `--motion-slow` scale to 1.045 | No zoom |
| **ANIM-06** | Card press | `.launch-card:active` | Press / tap | `--motion-fast` | Instant |
| **ANIM-07** | Featured-mission transition | `.motion-spotlight-enter` | Spotlight mission changes | `--motion-slow` rise | No animation |
| **ANIM-08** | Details countdown pulse | `.details-countdown strong.is-ticking` | Modal countdown value changes | `--motion-normal`, spring | No pulse |
| **ANIM-09** | Final-hour countdown glow | `.countdown-ring.is-final-hour` | < 1h to launch | 2.6s gentle loop | No glow |
| **ANIM-10** | Org pill active indicator | `.org-tab.is-active::after` | Organization selected | `--motion-normal` | Static indicator |
| **ANIM-11** | Overview tile hover bloom | `.overview-tile.is-org::after` | Pointer hover | `--motion-normal` | Layer removed |
| **ANIM-12** | Count roll-up + bump | `js/render.js`, `.is-bumped` | Tile counts change | 320ms roll + `--motion-normal` bump | Final value set instantly |
| **ANIM-13** | Insights chip cascade | `.insights-body.is-revealing` | Section **opened** (not re-render) | `--motion-normal`, 30ms steps (capped 150ms) | No animation |
| **ANIM-14** | Button sheen sweep | `.btn::after` and friends | Pointer hover | `--motion-emphasis` | Layer removed |
| **ANIM-15** | Button press | `.btn:active` | Press / tap | `--motion-fast` | Instant |
| **ANIM-16** | Save pop | `.favorite-btn.is-just-saved` | Mission saved | `--motion-normal`, spring | No pop |
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
| **ANIM-29** | Segmented countdown roll | `.cd-value.is-rolling` | Each changed D/H/M/S digit | `--motion-fast` roll-up | Digits update, no roll |

## Notes on the two most involved ones

### ANIM-01 — startup sequence

1. A full-screen charcoal overlay presents the product title.
2. A light band sweeps across the glyphs (`background-clip: text` on a moving
   gradient) while launch data loads underneath.
3. The title **FLIPs** — measured `getBoundingClientRect()` on both the boot
   title and the real hero `<h1>`, then a single `translate()+scale()` moves it
   into place — and the backdrop fades out.
4. `.is-booted` triggers the section reveal (ANIM-02).

It is skipped for reduced motion, for `?mission=` deep links, and after the
first play in a tab (`sessionStorage`). It is click/key skippable, has a hard
failsafe timer, and the "hidden while booting" state is added by JS only — so
no-JS visitors and the test harness always see the dashboard.

### ANIM-29 — segmented countdown

The hero countdown renders days / hours / minutes / seconds as separate cells.
Each tick only rewrites and rolls the cells whose value actually changed, so the
seconds animate every second while the days sit still. The visible digits are
`aria-hidden`; an `.sr-only` text copy carries the value **without** an
`aria-live` region, so screen readers are never spammed once per second.
