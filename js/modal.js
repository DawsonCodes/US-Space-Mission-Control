// Accessible overlay mechanics shared by the mission-details modal and the
// saved-missions drawer: focus trap, Escape to close, backdrop-click to close,
// background scroll lock, and focus restoration to the triggering element.
// Pure DOM utility — imports nothing app-specific (leaf module).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Only one overlay is open at a time in this app.
let active = null;

function focusableNodes(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement
  );
}

function trapTab(event, panel) {
  const nodes = focusableNodes(panel);
  if (nodes.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!panel.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function isOverlayOpen(root) {
  return Boolean(active) && (!root || active.root === root);
}

export function openOverlay(root, { onClose, returnFocusTo } = {}) {
  if (!root) return;
  if (active) closeOverlay();

  const opener =
    returnFocusTo ||
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const panel = root.querySelector("[data-overlay-panel]") || root;
  const backdrop = root.querySelector("[data-overlay-backdrop]");

  root.classList.add("is-open");
  root.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
    } else if (event.key === "Tab") {
      trapTab(event, panel);
    }
  };
  const onBackdrop = (event) => {
    if (event.target === backdrop) closeOverlay();
  };

  document.addEventListener("keydown", onKey, true);
  if (backdrop) backdrop.addEventListener("click", onBackdrop);

  active = { root, panel, backdrop, onClose, opener, onKey, onBackdrop };

  // Defer focus until the element is visible/transitioned in.
  requestAnimationFrame(() => {
    const nodes = focusableNodes(panel);
    (nodes[0] || panel).focus();
  });
}

export function closeOverlay() {
  if (!active) return;
  const { root, backdrop, onClose, opener, onKey, onBackdrop } = active;

  document.removeEventListener("keydown", onKey, true);
  if (backdrop) backdrop.removeEventListener("click", onBackdrop);

  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-open");
  active = null;

  if (typeof onClose === "function") onClose();
  if (opener && typeof opener.focus === "function") opener.focus();
}
