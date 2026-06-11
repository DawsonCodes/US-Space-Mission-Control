// Organization accent-color system: distinct defaults + locally-saved
// per-organization customization. Accents live as CSS custom properties on
// :root (--org-nasa, --org-spacex, …); this module applies user overrides from
// localStorage and exposes a curated, accessible swatch palette for the
// customization panel. No dependencies.

import { ORG } from "./organizations.js";

// Namespaced storage key — distinct from saved missions, cache, prefs, etc.
export const ORG_COLORS_KEY = "us-space-mission-control-org-colors";

// The customizable organizations (NASA + the five providers). "all" and "saved"
// are neutral and intentionally not user-customizable.
export const CUSTOMIZABLE_ORGS = [
  ORG.NASA,
  ORG.SPACEX,
  ORG.BLUE_ORIGIN,
  ORG.ROCKET_LAB,
  ORG.ULA,
  ORG.FIREFLY
];

// CSS custom-property suffix for each org (matches base.css tokens).
const CSS_VAR = {
  [ORG.NASA]: "--org-nasa",
  [ORG.SPACEX]: "--org-spacex",
  [ORG.BLUE_ORIGIN]: "--org-blueorigin",
  [ORG.ROCKET_LAB]: "--org-rocketlab",
  [ORG.ULA]: "--org-ula",
  [ORG.FIREFLY]: "--org-firefly"
};

// Distinct, dark-theme-friendly defaults (kept in sync with base.css).
export const DEFAULT_ORG_COLORS = {
  [ORG.NASA]: "#ff7a90",
  [ORG.SPACEX]: "#5aa0ff",
  [ORG.BLUE_ORIGIN]: "#ffcf5c",
  [ORG.ROCKET_LAB]: "#51d8a8",
  [ORG.ULA]: "#b69bff",
  [ORG.FIREFLY]: "#ff8a4c"
};

// Curated, accessible accent swatches offered in the customization panel. All
// are tuned for readable contrast on the dark cinematic background, so users
// can't pick an unreadable accent.
export const CURATED_SWATCHES = [
  "#ff7a90", "#ff5e7e", "#ff8a4c", "#ffa94d", "#ffcf5c", "#ffe066",
  "#51d8a8", "#3ad6c5", "#5aa0ff", "#74c0fc", "#7d8bff", "#b69bff",
  "#e599f7", "#f783ac", "#9fb3c8", "#c0cad8"
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Parse "#rrggbb" → {r,g,b} or null.
function parseHex(hex) {
  if (typeof hex !== "string" || !HEX_RE.test(hex.trim())) return null;
  const h = hex.trim();
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16)
  };
}

// Relative luminance (sRGB) for a parsed color.
function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// A valid accent must be a 6-digit hex AND bright enough to read as an accent on
// the dark UI (clamps unreadable custom values from <input type="color">).
export function isReadableAccent(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  return luminance(rgb) >= 0.12;
}

// Validate a stored map, keeping only readable hex values for known orgs.
function sanitizeStored(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const org of CUSTOMIZABLE_ORGS) {
    const value = raw[org];
    if (typeof value === "string" && isReadableAccent(value)) {
      out[org] = value.trim().toLowerCase();
    }
  }
  return out;
}

// Read saved overrides (sanitized). Malformed JSON / values are ignored safely.
export function loadOrgColors() {
  try {
    const raw = localStorage.getItem(ORG_COLORS_KEY);
    if (!raw) return {};
    return sanitizeStored(JSON.parse(raw));
  } catch {
    return {};
  }
}

// The effective colors = defaults overlaid with saved overrides.
export function getEffectiveOrgColors() {
  return { ...DEFAULT_ORG_COLORS, ...loadOrgColors() };
}

// Apply the effective colors to the document's :root custom properties.
export function applyOrgColors(colors = getEffectiveOrgColors(), root) {
  const target = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!target || !target.style) return colors;
  for (const org of CUSTOMIZABLE_ORGS) {
    const value = isReadableAccent(colors[org]) ? colors[org] : DEFAULT_ORG_COLORS[org];
    target.style.setProperty(CSS_VAR[org], value);
  }
  return colors;
}

// Persist + apply a single org override (guarded against quota/serialization).
export function setOrgColor(org, hex) {
  if (!CUSTOMIZABLE_ORGS.includes(org) || !isReadableAccent(hex)) return false;
  const next = { ...loadOrgColors(), [org]: hex.trim().toLowerCase() };
  try {
    localStorage.setItem(ORG_COLORS_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  applyOrgColors();
  return true;
}

// Reset every override back to the defaults.
export function resetOrgColors() {
  try {
    localStorage.removeItem(ORG_COLORS_KEY);
  } catch {
    // ignore
  }
  applyOrgColors();
}
