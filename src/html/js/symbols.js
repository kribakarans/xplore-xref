// symbols.js — symbol palette modal (segmented toggle + persistence + a11y)
// Logging format: "LEVEL | message"

import { workspaceTags, symbolsByFile } from "./tags.js";
import { escapeHtml } from "./utils.js";
import { statusCenter } from "./status.js";
import { navigateTo } from "./nav.js";
import { getActivePath } from "./editor.js";
import { registerModal } from "./modal.js";
import { setProgress } from "./progress.js";

/* ────────────────────────────────────────────────────────────────────────────
 * Constants / state
 * ──────────────────────────────────────────────────────────────────────────── */
const LS_SCOPE_KEY = "xplore.symbols.scope";
const SCOPE = Object.freeze({ WORKSPACE: "workspace", FILE: "file" });
let currentScope =
  localStorage.getItem(LS_SCOPE_KEY) === SCOPE.FILE ? SCOPE.FILE : SCOPE.WORKSPACE;

/* DOM refs (static in modal) */
const modalEl   = document.getElementById("symbol-modal");
const resultsEl = document.getElementById("symbol-results");
const queryEl   = document.getElementById("symbol-query");
const closeBtn  = document.getElementById("symbol-close");

/* ────────────────────────────────────────────────────────────────────────────
 * Register with the unified modal manager
 * ──────────────────────────────────────────────────────────────────────────── */
const symbolModal = registerModal("symbol-modal", {
  closeOnOverlay: true,
  onOpen: () => {
    initSegmentedToggle();
    setActiveSymbolTab(localStorage.getItem(LS_SCOPE_KEY) || currentScope);
    console.debug("DEBUG | symbols.js | onOpen via registerModal option");
  },
});

/* Fallback: watch aria-hidden changes to re-init on open */
if (modalEl) {
  const watchOpen = () => {
    const isOpen = modalEl.getAttribute("aria-hidden") === "false";
    if (isOpen) {
      initSegmentedToggle();
      setActiveSymbolTab(localStorage.getItem(LS_SCOPE_KEY) || currentScope);
      console.debug("DEBUG | symbols.js | onOpen via MutationObserver");
    }
  };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.attributeName === "aria-hidden") watchOpen();
    }
  });
  mo.observe(modalEl, { attributes: true });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Persistence helpers
 * ──────────────────────────────────────────────────────────────────────────── */
function persistScope(scope) {
  try {
    localStorage.setItem(LS_SCOPE_KEY, scope);
    console.info(`INFO  | symbols.js | Persisted scope: ${scope}`);
  } catch (e) {
    console.warn("WARN  | symbols.js | Could not persist scope", e);
  }
}

/* Apply scope -> UI + placeholder + dataset + event */
function applyScope(scope) {
  currentScope = scope;
  if (queryEl) {
    queryEl.dataset.scope = scope;
    queryEl.placeholder =
      scope === SCOPE.WORKSPACE
        ? "Search symbols in workspace…"
        : "Search symbols in current file…";
  }

  // Update toggle visuals and a11y
  if (modalEl) {
    const tabs = modalEl.querySelectorAll(".modal-tabs button[data-tab]");
    tabs.forEach((b) => {
      const isActive = b.dataset.tab === scope;
      b.classList.toggle("is-active", isActive);
      b.classList.remove("active"); // legacy class (no-op)
      b.setAttribute("aria-pressed", String(isActive));
    });

    // Notify any listeners
    modalEl.dispatchEvent(
      new CustomEvent("symbols:scope-changed", { bubbles: true, detail: { scope } })
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Segmented toggle initialization (non-destructive to existing markup)
 *  - We DO NOT add any class to the container; only to the two buttons.
 *  - The close button stays separate at the right via CSS (margin-left:auto).
 * ──────────────────────────────────────────────────────────────────────────── */
function initSegmentedToggle() {
  if (!modalEl) return;
  const tabsContainer = modalEl.querySelector(".modal-tabs");
  if (!tabsContainer) return;

  const buttons = tabsContainer.querySelectorAll("button[data-tab]");
  buttons.forEach((btn) => {
    btn.classList.add("segmented-toggle__btn");
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
  });

  // Keyboard support: Space/Enter to activate; Left/Right to flip
  const wsBtn   = tabsContainer.querySelector('button[data-tab="workspace"]');
  const fileBtn = tabsContainer.querySelector('button[data-tab="file"]');

  const flip = () =>
    setActiveSymbolTab(
      currentScope === SCOPE.WORKSPACE ? SCOPE.FILE : SCOPE.WORKSPACE
    );

  [wsBtn, fileBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("keydown", (ev) => {
      const k = ev.key;
      if (k === " " || k === "Enter") {
        ev.preventDefault();
        setActiveSymbolTab(btn.dataset.tab);
      } else if (k === "ArrowLeft" || k === "ArrowRight") {
        ev.preventDefault();
        flip();
        const active = currentScope === SCOPE.WORKSPACE ? wsBtn : fileBtn;
        active && active.focus();
      }
    });
  });

  // Initial paint
  applyScope(currentScope);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public open/close
 * ──────────────────────────────────────────────────────────────────────────── */
export function openSymbolModal(tab) {
  symbolModal.open();
  setActiveSymbolTab(tab || currentScope);
  if (queryEl) {
    queryEl.value = "";
    // Focus after paint to avoid scroll jumps
    setTimeout(() => queryEl.focus(), 0);
  }
  if (resultsEl) resultsEl.innerHTML = "";
  setProgress("symbol-progress", null); // hide on open
  statusCenter(`Symbols: ${currentScope}`);
}

export function closeSymbolModal() {
  symbolModal.close();
  statusCenter("Symbols: closed");
}

/* Close via button */
if (closeBtn) closeBtn.addEventListener("click", closeSymbolModal);

/* ────────────────────────────────────────────────────────────────────────────
 * Scope change (unified for click/keyboard/programmatic)
 * ──────────────────────────────────────────────────────────────────────────── */
function setActiveSymbolTab(which) {
  const scope = which === SCOPE.FILE ? SCOPE.FILE : SCOPE.WORKSPACE;
  persistScope(scope);
  applyScope(scope);
  updateSymbolResults();
  statusCenter(`Symbols scope: ${scope}`);
}

/* Click handlers for the two header buttons */
modalEl?.querySelectorAll(".modal-tabs button[data-tab]").forEach((btn) => {
  if (btn.id === "symbol-close") return;
  btn.addEventListener("click", () => setActiveSymbolTab(btn.dataset.tab));
});

/* ────────────────────────────────────────────────────────────────────────────
 * Query input -> live update
 * ──────────────────────────────────────────────────────────────────────────── */
queryEl?.addEventListener("input", () => {
  updateSymbolResults();
  console.debug(`DEBUG | symbols.js | Query: "${queryEl.value.trim()}"`);
});

/* ────────────────────────────────────────────────────────────────────────────
 * Results list navigation
 * ──────────────────────────────────────────────────────────────────────────── */
resultsEl?.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-path]");
  if (!li) return;
  const path = li.getAttribute("data-path");
  const line = li.getAttribute("data-line");
  const pattern = li.getAttribute("data-pattern");
  closeSymbolModal();
  await navigateTo(path, line ? Number(line) : null, pattern || null, { record: true });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Fuzzy filter (lightweight)
 * ──────────────────────────────────────────────────────────────────────────── */
export function fuzzyFilter(list, q, limit = 100) {
  if (!q) return list.slice(0, limit);
  const needle = q.toLowerCase();
  const scored = list.map((item) => {
    const hay = String(item.name || "").toLowerCase();
    let si = 0;
    let score = 0;
    for (let i = 0; i < hay.length && si < needle.length; i++) {
      if (hay[i] === needle[si]) {
        score += 2;
        si++;
      } else {
        score -= 0.1;
      }
    }
    if (si < needle.length) score -= 10;
    score += Math.max(0, 8 - (hay.length - needle.length));
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Render results
 * ──────────────────────────────────────────────────────────────────────────── */
export function updateSymbolResults() {
  if (!resultsEl || !queryEl) return;

  const scope = queryEl.dataset.scope || SCOPE.WORKSPACE;
  const q = queryEl.value.trim();

  let list = [];
  const active = getActivePath();
  if (scope === SCOPE.FILE && active && symbolsByFile.has(active)) {
    list = symbolsByFile.get(active);
  } else {
    list = workspaceTags;
  }

  setProgress("symbol-progress", 20); // quick pulse

  const matches = fuzzyFilter(list, q, 200);

  setProgress("symbol-progress", null); // hide once done

  resultsEl.innerHTML = "";
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No results";
    resultsEl.appendChild(empty);
    return;
  }

  for (const s of matches) {
    const li = document.createElement("li");
    li.setAttribute("data-path", s.path);
    if (s.line) li.setAttribute("data-line", String(s.line));
    if (s.pattern) li.setAttribute("data-pattern", s.pattern);
    li.innerHTML =
      `<span class="codicon codicon-symbol-property"></span>` +
      `<span class="name">${escapeHtml(s.name)}</span>` +
      `<span class="dim">${escapeHtml(shortenPath(s.path))}${s.line ? ":" + s.line : ""}</span>`;
    resultsEl.appendChild(li);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Utils
 * ──────────────────────────────────────────────────────────────────────────── */
function shortenPath(p) {
  const parts = String(p).split("/");
  if (parts.length <= 3) return p;
  return `${parts.slice(0, 1)}/…/${parts.slice(-2).join("/")}`;
}
