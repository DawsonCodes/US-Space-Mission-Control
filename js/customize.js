// Organization-color customization panel. Renders one row per customizable
// organization with curated, accessible swatches (plus an optional clamped
// native colour input) and a Reset action. Selecting a colour applies it
// immediately by rewriting the :root --org-* tokens, so the whole dashboard
// previews live without re-rendering. No dependencies.

import { ORG_LABELS } from "./organizations.js";
import {
  CUSTOMIZABLE_ORGS,
  CURATED_SWATCHES,
  DEFAULT_ORG_COLORS,
  getEffectiveOrgColors,
  setOrgColor,
  resetOrgColors,
  isReadableAccent
} from "./org-theme.js";

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function swatchRow(org, current) {
  const label = ORG_LABELS[org] || org;
  const swatches = CURATED_SWATCHES.map((hex) => {
    const selected = hex.toLowerCase() === String(current).toLowerCase();
    return `<button
        type="button"
        class="swatch${selected ? " is-selected" : ""}"
        role="radio"
        aria-checked="${selected}"
        data-org="${escapeAttr(org)}"
        data-color="${escapeAttr(hex)}"
        style="--swatch:${escapeAttr(hex)}"
        aria-label="Set ${escapeAttr(label)} accent to ${escapeAttr(hex)}"
        title="${escapeAttr(hex)}"></button>`;
  }).join("");

  return `
    <div class="customize-row" role="group" aria-label="${escapeAttr(label)} accent colour">
      <div class="customize-row-head">
        <span class="customize-dot" style="--swatch:${escapeAttr(current)}" aria-hidden="true"></span>
        <span class="customize-org">${escapeAttr(label)}</span>
      </div>
      <div class="customize-swatches" role="radiogroup" aria-label="${escapeAttr(label)} curated accents">
        ${swatches}
        <label class="swatch-custom" title="Custom colour (clamped for readability)">
          <span class="sr-only">Custom ${escapeAttr(label)} accent colour</span>
          <input type="color" data-org="${escapeAttr(org)}" data-custom value="${escapeAttr(current)}" />
        </label>
      </div>
    </div>`;
}

// Build the panel markup for the current effective colours.
export function buildColorCustomizerContent() {
  const colors = getEffectiveOrgColors();
  const rows = CUSTOMIZABLE_ORGS.map((org) => swatchRow(org, colors[org])).join("");
  return `
    <h2 id="orgColorsTitle" class="details-title">Customize organization colors</h2>
    <p class="customize-intro">Pick an accent for each organization. Changes preview instantly and are saved on this device.</p>
    <div class="customize-rows" data-customize-rows>${rows}</div>
    <div class="customize-actions">
      <button type="button" class="btn btn-danger-outline" data-reset-colors>Reset to defaults</button>
    </div>`;
}

// Wire delegated handlers onto the panel container. `onChange` is called after
// any applied change so the caller can refresh dependent UI if needed.
export function wireColorCustomizer(container, onChange = () => {}) {
  if (!container) return;

  const refresh = () => {
    container.innerHTML = buildColorCustomizerContent();
    onChange();
  };

  container.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch[data-color]");
    if (swatch) {
      if (setOrgColor(swatch.getAttribute("data-org"), swatch.getAttribute("data-color"))) refresh();
      return;
    }
    const reset = event.target.closest("[data-reset-colors]");
    if (reset) {
      resetOrgColors();
      refresh();
    }
  });

  // Native colour input: only applied if it clamps to a readable accent.
  container.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="color"][data-custom]');
    if (!input) return;
    const org = input.getAttribute("data-org");
    if (isReadableAccent(input.value)) {
      if (setOrgColor(org, input.value)) refresh();
    } else {
      // Too dark to read on the dark UI — revert to the current/default accent.
      input.value = getEffectiveOrgColors()[org] || DEFAULT_ORG_COLORS[org];
    }
  });
}
