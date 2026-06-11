// Lightweight typewriter search-hint for the mission search field. Animates the
// placeholder (a small blinking caret + rotating example prompts) only while the
// field is empty AND unfocused. Stops on focus / typing, pauses while the tab is
// hidden, and falls back to a static placeholder for reduced-motion users. The
// accessible name stays a static aria-label on the input (set in index.html);
// the animated placeholder is purely decorative. No dependencies; timers are
// always cleaned up.

const PROMPTS = [
  "Search SpaceX, Starship, Artemis...",
  "Search Rocket Lab, Electron, Wallops...",
  "Search NASA, Dragon, Florida...",
  "Search Blue Origin, New Glenn...",
  "Search ULA, Vulcan, Cape Canaveral...",
  "Search Firefly, Alpha, Vandenberg..."
];
const STATIC_PLACEHOLDER = "Search missions…";

const TYPE_MS = 65;
const ERASE_MS = 35;
const HOLD_FULL_MS = 1500;
const HOLD_EMPTY_MS = 450;
const CARET_MS = 530;

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function setupSearchHint(input) {
  if (!input) return () => {};

  // Reduced-motion: a calm static placeholder, no animation at all.
  if (prefersReducedMotion()) {
    input.placeholder = STATIC_PLACEHOLDER;
    return () => {};
  }

  let promptIdx = 0;
  let charIdx = 0;
  let erasing = false;
  let caretOn = true;
  let typeTimer = null;
  let caretTimer = null;

  const canRun = () =>
    input.value === "" &&
    document.activeElement !== input &&
    (typeof document.visibilityState !== "string" || document.visibilityState !== "hidden");

  const paint = () => {
    const text = PROMPTS[promptIdx].slice(0, charIdx);
    input.placeholder = `${text}${caretOn ? "|" : " "}`;
  };

  const clearTimers = () => {
    if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
    if (caretTimer) { clearInterval(caretTimer); caretTimer = null; }
  };

  const step = () => {
    if (!canRun()) { stop(); return; }
    const full = PROMPTS[promptIdx];
    let delay;
    if (!erasing) {
      if (charIdx < full.length) {
        charIdx += 1;
        delay = TYPE_MS;
      } else {
        erasing = true;
        delay = HOLD_FULL_MS;
      }
    } else if (charIdx > 0) {
      charIdx -= 1;
      delay = ERASE_MS;
    } else {
      erasing = false;
      promptIdx = (promptIdx + 1) % PROMPTS.length;
      delay = HOLD_EMPTY_MS;
    }
    paint();
    typeTimer = window.setTimeout(step, delay);
  };

  function start() {
    if (typeTimer || caretTimer) return; // already running
    if (!canRun()) { input.placeholder = STATIC_PLACEHOLDER; return; }
    caretTimer = window.setInterval(() => {
      caretOn = !caretOn;
      if (canRun()) paint();
    }, CARET_MS);
    paint();
    typeTimer = window.setTimeout(step, HOLD_EMPTY_MS);
  }

  function stop() {
    clearTimers();
    // Keep a clean static placeholder so the field never looks unfinished.
    input.placeholder = STATIC_PLACEHOLDER;
  }

  const onFocus = () => stop();
  const onBlur = () => { if (input.value === "") start(); };
  const onInput = () => { if (input.value === "") start(); else stop(); };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") clearTimers();
    else if (input.value === "" && document.activeElement !== input) start();
  };

  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("input", onInput);
  document.addEventListener("visibilitychange", onVisibility);

  start();

  // Returned disposer (used by tests) tears everything down.
  return () => {
    clearTimers();
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    input.removeEventListener("input", onInput);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
