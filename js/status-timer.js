// Pure status-countdown state machine — the single source of truth for the
// temporary status banner's timing. Both the visible seconds and the progress
// bar are derived from the SAME remaining-time value, so they can never drift.
//
// Timing is wall-clock based (a deadline timestamp), so a backgrounded/hidden
// tab cannot corrupt it: remaining() always recomputes from the real clock.
// pause()/resume() preserve the exact remaining time. This module is DOM-free
// and fully unit-testable.

export const STATUS_DURATION_MS = 10000;

export function createStatusTimer(durationMs = STATUS_DURATION_MS) {
  let deadline = 0;
  let remainingWhenPaused = null; // ms remaining while paused; null when running
  let active = false;

  return {
    duration: durationMs,

    // Begin (or restart) a fresh countdown. Resets any paused state.
    start(now = Date.now()) {
      active = true;
      remainingWhenPaused = null;
      deadline = now + durationMs;
    },

    // Stop entirely (e.g. a persistent message replaces a temporary one).
    stop() {
      active = false;
      remainingWhenPaused = null;
      deadline = 0;
    },

    isActive() {
      return active;
    },

    isPaused() {
      return active && remainingWhenPaused !== null;
    },

    // Freeze the remaining time (hover / keyboard focus).
    pause(now = Date.now()) {
      if (!active || remainingWhenPaused !== null) return;
      remainingWhenPaused = Math.max(0, deadline - now);
    },

    // Continue from exactly where it was paused.
    resume(now = Date.now()) {
      if (!active || remainingWhenPaused === null) return;
      deadline = now + remainingWhenPaused;
      remainingWhenPaused = null;
    },

    // Milliseconds left (0 when stopped/expired).
    remaining(now = Date.now()) {
      if (!active) return 0;
      if (remainingWhenPaused !== null) return remainingWhenPaused;
      return Math.max(0, deadline - now);
    },

    // Visible whole seconds, derived from remaining().
    seconds(now = Date.now()) {
      return Math.ceil(this.remaining(now) / 1000);
    },

    // Progress fraction 0..1 (full -> empty), derived from the same remaining().
    progress(now = Date.now()) {
      const r = this.remaining(now);
      return Math.max(0, Math.min(1, r / durationMs));
    },

    // True once a running (non-paused) timer has reached its deadline.
    isExpired(now = Date.now()) {
      return active && remainingWhenPaused === null && now >= deadline;
    }
  };
}
