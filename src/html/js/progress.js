// progress.js — modal progress bar utilities

/**
 * Update the progress bar (0–100).
 * Pass `null` to hide the bar.
 *
 * @param {string} id - The element ID of the progress wrapper
 * @param {?number} percent - Percentage (0–100), or null to hide.
 */
export function setProgress(id, percent) {
  const wrap = document.getElementById(id);
  if (!wrap) return;

  const bar = wrap.querySelector(".bar");
  if (!bar) return;

  if (percent == null) {
    wrap.style.display = "none";
    bar.style.width = "0%";
    return;
  }

  wrap.style.display = "block";
  const clamped = Math.max(0, Math.min(100, percent));
  bar.style.width = `${clamped}%`;
}
