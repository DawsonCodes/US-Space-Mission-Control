// Startup ("boot") sequence — ANIM-01.
//
// Timeline:
//   1. The product title fades in and a light band sweeps across the letters
//      (the "thinking" shimmer), running continuously.
//   2. A "Loading" row with a spinner fades in underneath it.
//   3. The sequence holds until BOTH conditions are met:
//        * at least MIN_PHASE_MS (3s) has elapsed, and
//        * the app has signalled that its first render is on screen.
//      A hard cap stops a hanging network from trapping anyone.
//   4. The row flips to "Loaded" with a check, holds briefly, then fades out.
//   5. The title FLIPs into the exact position of the real hero <h1>.
//   6. The overlay clears and the dashboard sections reveal in a stagger.
//
// Safety rules:
//   * Content is visible BY DEFAULT — the "hidden while booting" state is only
//     ever added by JS, so no-JS visitors and the test harness see everything.
//   * Every DOM capability is feature-detected; a minimal/shimmed DOM no-ops.
//   * reduced motion, a `?mission=` deep link, or a repeat visit in the same tab
//     skip straight to the dashboard.
//   * Skippable (click / key) and self-cleaning via a finish() that is safe to
//     call repeatedly, plus a failsafe timer.

const BOOT_FLAG = "us-space-mission-control-booted"; // sessionStorage: once per tab

const TITLE_IN_MS = 420;       // title fade/rise
const LOADING_IN_MS = 520;     // when the Loading row appears
const MIN_PHASE_MS = 3000;     // the shimmer+loading phase never runs shorter
const MAX_PHASE_MS = 9000;     // ...and never longer, even if data stalls
const LOADED_HOLD_MS = 700;    // how long the "Loaded" confirmation shows
const LOADING_OUT_MS = 240;    // loading row fade-out before the hand-off
const FLIP_MS = 620;           // title travel to the hero heading

// Resolved by main.js once the first real render is on screen.
let markReady = () => {};
const readyPromise = new Promise((resolve) => {
  markReady = resolve;
});

/** Called by the app when its first render has painted. Safe to call repeatedly. */
export function signalBootReady() {
  markReady();
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

function alreadyBootedThisTab() {
  try {
    return sessionStorage.getItem(BOOT_FLAG) === "1";
  } catch {
    return false;
  }
}

function markBooted() {
  try {
    sessionStorage.setItem(BOOT_FLAG, "1");
  } catch {
    /* private mode / quota — the animation simply replays next load */
  }
}

function shouldSkip(overlay, title, heroTitle) {
  if (!overlay || !title || !heroTitle) return true;
  if (typeof overlay.getBoundingClientRect !== "function") return true; // shimmed DOM
  if (typeof document.documentElement?.classList?.add !== "function") return true;
  if (prefersReducedMotion()) return true;
  if (alreadyBootedThisTab()) return true;
  try {
    if (new URLSearchParams(window.location.search).get("mission")) return true;
  } catch {
    /* ignore malformed URLs */
  }
  return false;
}

// Move the boot title onto the hero heading. Rather than scaling by a width
// ratio (which distorts when the two wrap differently), we first copy the hero's
// font-size / width / alignment onto the boot title so the glyph geometry
// matches exactly, then translate by the measured delta. That makes the landing
// pixel-accurate instead of approximate.
function flipTitleToHero(title, heroTitle) {
  const to = heroTitle.getBoundingClientRect();
  if (!(to.width > 0 && to.height > 0)) return false;

  let heroFont = "";
  let heroWeight = "";
  let heroLine = "";
  try {
    const cs = window.getComputedStyle?.(heroTitle);
    heroFont = cs?.fontSize || "";
    heroWeight = cs?.fontWeight || "";
    heroLine = cs?.lineHeight || "";
  } catch {
    /* fall back to whatever the boot title already uses */
  }

  // Match the hero's typography + box so wrapping is identical...
  title.style.textAlign = "left";
  if (heroFont) title.style.fontSize = heroFont;
  if (heroWeight) title.style.fontWeight = heroWeight;
  if (heroLine) title.style.lineHeight = heroLine;
  title.style.width = `${to.width}px`;

  // ...then measure the re-laid-out title and translate the difference.
  void title.offsetWidth; // force reflow so the new box is measured
  const from = title.getBoundingClientRect();
  const dx = to.left - from.left;
  const dy = to.top - from.top;

  title.style.transition = `transform ${FLIP_MS}ms var(--ease-out)`;
  title.style.transform = `translate(${dx}px, ${dy}px)`;
  return true;
}

export function setupBoot() {
  const overlay = document.getElementById("bootScreen");
  const title = document.getElementById("bootTitle");
  const loading = document.getElementById("bootLoading");
  const loadingText = document.getElementById("bootLoadingText");
  const heroTitle = document.querySelector(".hero-copy h1");
  const root = document.documentElement;

  if (shouldSkip(overlay, title, heroTitle)) {
    // The head gate may already have hidden the page; always release it.
    root?.classList?.remove?.("is-booting");
    overlay?.remove?.();
    markBooted();
    return;
  }

  // Claim the once-per-tab flag up front so reloading mid-animation can't replay.
  markBooted();
  root.classList.add("is-booting");
  overlay.hidden = false;

  const timers = [];
  const after = (ms, fn) => timers.push(window.setTimeout(fn, ms));
  let finished = false;
  let handingOff = false;

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    document.removeEventListener("keydown", skip, true);
    overlay.removeEventListener("click", skip);

    root.classList.remove("is-booting");
    root.classList.add("is-booted"); // drives the section reveal stagger (ANIM-02)
    overlay.classList.add("is-done");
    window.setTimeout(() => overlay.remove?.(), 420);
  }

  function skip() {
    finish();
  }

  // Phase 4 → 5: drop the loading row, then fly the title home.
  function handOff() {
    if (handingOff || finished) return;
    handingOff = true;

    // Confirm the load before anything moves, so the sequence reads
    // Loading -> Loaded -> hand-off rather than just cutting away.
    title.classList.remove("is-shimmering");
    if (loadingText) loadingText.textContent = "Loaded";
    loading?.classList?.add("is-loaded");

    after(LOADED_HOLD_MS, () => loading?.classList?.add("is-leaving"));

    after(LOADED_HOLD_MS + LOADING_OUT_MS, () => {
      let flipped = false;
      try {
        flipped = flipTitleToHero(title, heroTitle);
      } catch {
        flipped = false;
      }
      overlay.classList.add("is-lifting"); // backdrop fades as the title travels
      after(flipped ? FLIP_MS - 60 : 160, finish);
    });
  }

  document.addEventListener("keydown", skip, true);
  overlay.addEventListener("click", skip);

  // Phase 1 → 2.
  after(TITLE_IN_MS, () => title.classList.add("is-shimmering"));
  after(LOADING_IN_MS, () => loading?.classList?.add("is-visible"));

  // Phase 3: hold for the minimum window AND until the app says it has painted.
  const minimumHold = new Promise((resolve) => window.setTimeout(resolve, MIN_PHASE_MS));
  Promise.all([minimumHold, readyPromise]).then(handOff);

  // Cap the wait so a stalled network can never hold the overlay open.
  after(MAX_PHASE_MS, handOff);

  // Absolute failsafe: never leave the dashboard covered, whatever happens.
  after(MAX_PHASE_MS + LOADED_HOLD_MS + LOADING_OUT_MS + FLIP_MS + 900, finish);
}
