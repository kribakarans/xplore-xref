// modal.js — unified modal manager (ESC + overlay + open/close API)
//
// Features
// - Register any modal by element id
// - Open/close programmatically
// - Overlay click to close (configurable per modal)
// - Global ESC closes all registered modals
//
// Usage:
//   import { registerModal, closeAllModals } from "./modal.js";
//   const myModal = registerModal("my-modal-id", { closeOnOverlay: true });
//   myModal.open(); myModal.close();

const __modals = new Map();

/** Register a modal container (the overlay element with the given id). */
export function registerModal(id, opts = { closeOnOverlay: true }) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[modal] Element not found: #${id}`);

  const state = {
    id,
    el,
    closeOnOverlay: opts.closeOnOverlay !== false,
    previouslyFocused: null,
  };

  // Overlay click to close
  if (state.closeOnOverlay) {
    el.addEventListener("click", (e) => {
      if (e.target === el) close(id);
    });
  }

  __modals.set(id, state);

  // Controller API for the caller
  return {
    open: () => open(id),
    close: () => close(id),
    element: el,
  };
}

/** Open a registered modal */
export function open(id) {
  const m = __modals.get(id);
  if (!m) return;
  // Keep focus to restore after close
  m.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  m.el.setAttribute("aria-hidden", "false");
  m.el.style.display = "flex";
}

/** Close a registered modal */
export function close(id) {
  const m = __modals.get(id);
  if (!m) return;
  m.el.setAttribute("aria-hidden", "true");
  m.el.style.display = "none";
  // Restore focus politely
  try { m.previouslyFocused?.focus?.(); } catch {}
}

/** Close all modals */
export function closeAllModals() {
  for (const id of __modals.keys()) close(id);
}

// Global ESC to close all
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllModals();
    // Do not preventDefault to keep other ESC behaviors (e.g., Monaco) intact
  }
});
