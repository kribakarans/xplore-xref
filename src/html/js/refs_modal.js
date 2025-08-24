// refs_modal.js — modal shell shared by refs.js
import { registerModal } from "./modal.js";

export const refsModal   = document.getElementById("refs-modal");
export const refsResults = document.getElementById("refs-results");
const refsClose          = document.getElementById("refs-close");

// Register with the unified modal manager
const refsCtl = registerModal("refs-modal", { closeOnOverlay: true });

export function closeRefsModal() {
  refsCtl.close();
}
export function openRefsModal(title) {
  document.getElementById("refs-title").textContent = title || "References";
  refsResults.innerHTML = "";
  refsCtl.open();
}

if (refsClose) refsClose.addEventListener("click", closeRefsModal);
