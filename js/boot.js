// Startup ("boot") sequence — ANIM-01.
//
// Timeline:
//   1. A full-screen charcoal overlay shows the product title centred.
//   2. A light shimmer sweeps across the letters (the same feel as an AI
//      "thinking" shimmer) while the app loads data underneath.
//   3. The title FLIPs — translates + scales — from the centre of the screen to
//      the exact position of the real hero <h1>, then hands off to it.
//   4. The overlay clears and the dashboard sections reveal in a short stagger.
//
// Safety rules this module follows:
//   * Content is visible BY DEFAULT. The "hidden while booting" state is only
//     ever added by JS, so no-JS visitors, crawlers, and the headless test
//     harness always see the full dashboard.
//   * Every DOM capability is feature-detected; in a minimal/shimmed DOM the
//     whole thing no-ops instead of throwing.
//   * prefers-reduced-motion, a `?mission=` deep link, or a repeat visit in the
//     same tab skip straight to the dashboard.
//   * The sequence is skippable (click / key / touch) and self-cleans via a
//     single finish() that is safe to call repeatedly.

const BOOT_FLAG = "us-space-mission-control-booted"; // sessionStorage: once per tab

// Timings (ms). Total ≈ 2.2s, kept deliberately tight.
const TITLE_IN = 420;
const SHIMMER_HOLD = 1150;
const FLIP_MS = 620;

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

// The boot overlay is skipped when we can't animate meaningfully or when the
// visitor is trying to land somewhere specific.
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

export function setupBoot() {
  const overlay = document.getElementById("bootScreen");
  const title = document.getElementById("bootTitle");
  const heroTitle = document.querySelector(".hero-copy h1");
  const root = document.documentElement;

  if (shouldSkip(overlay, title, heroTitle)) {
    overlay?.remove?.();
    markBooted();
    return;
  }

  // Opt in to the pre-boot state only now that we know we'll animate. The
  // once-per-tab flag is claimed up front so reloading mid-animation doesn't
  // replay the sequence.
  markBooted();
  root.classList.add("is-booting");
  overlay.hidden = false;

  const timers = [];
  const after = (ms, fn) => timers.push(window.setTimeout(fn, ms));
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    document.removeEventListener("keydown", skip, true);
    overlay.removeEventListener("click", skip);

    root.classList.remove("is-booting");
    root.classList.add("is-booted"); // drives the section reveal stagger (ANIM-02)
    overlay.classList.add("is-done");
    // Remove the node once its fade-out has run so nothing lingers in the tree.
    window.setTimeout(() => overlay.remove?.(), 420);
  }

  function skip() {
    finish();
  }

  document.addEventListener("keydown", skip, true);
  overlay.addEventListener("click", skip);

  // Phase 1 → 2: the title is already fading/rising in via CSS; start the
  // shimmer immediately after so the two read as one motion.
  after(TITLE_IN, () => title.classList.add("is-shimmering"));

  // Phase 3: FLIP the boot title onto the real hero heading.
  after(TITLE_IN + SHIMMER_HOLD, () => {
    let flipped = false;
    try {
      const from = title.getBoundingClientRect();
      const to = heroTitle.getBoundingClientRect();
      // A zero-size target means the hero isn't laid out (hidden/odd viewport);
      // fall back to a plain fade rather than flinging the title somewhere odd.
      if (to.width > 0 && to.height > 0 && from.width > 0) {
        const scale = Math.max(0.2, Math.min(3, to.width / from.width));
        const dx = to.left - from.left;
        const dy = to.top - from.top;
        title.classList.remove("is-shimmering");
        title.style.transition = `transform ${FLIP_MS}ms var(--ease-out), opacity ${FLIP_MS}ms var(--ease-out)`;
        title.style.transformOrigin = "top left";
        title.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        flipped = true;
      }
    } catch {
      flipped = false;
    }
    overlay.classList.add("is-lifting"); // backdrop fades while the title travels
    after(flipped ? FLIP_MS - 60 : 180, finish);
  });

  // Absolute failsafe: never leave the dashboard covered, whatever happens.
  after(TITLE_IN + SHIMMER_HOLD + FLIP_MS + 900, finish);
}
