// symbols.js — symbol palette modal
import { workspaceTags, symbolsByFile } from "./tags.js";
import { escapeHtml } from "./utils.js";
import { statusCenter } from "./status.js";
import { navigateTo } from "./nav.js";
import { getActivePath } from "./editor.js";
import { registerModal } from "./modal.js";

// Register with the unified modal manager
const symbolModal = registerModal("symbol-modal", { closeOnOverlay: true });

const modalEl   = document.getElementById("symbol-modal");
const resultsEl = document.getElementById("symbol-results");
const queryEl   = document.getElementById("symbol-query");
const closeBtn  = document.getElementById("symbol-close");

export function openSymbolModal(tab) {
  symbolModal.open();
  setActiveSymbolTab(tab);
  queryEl.value = "";
  resultsEl.innerHTML = "";
  // Focus after paint to avoid scroll jumps
  setTimeout(() => queryEl.focus(), 0);
  statusCenter(`Symbols: ${tab}`);
}

export function closeSymbolModal() {
  symbolModal.close();
  statusCenter("Symbols: closed");
}

// Close via button
if (closeBtn) closeBtn.addEventListener("click", closeSymbolModal);

function setActiveSymbolTab(which) {
  const tabs = modalEl.querySelectorAll(".modal-tabs button");
  tabs.forEach(b => b.classList.remove("active"));
  const btn = Array.from(tabs).find(b => b.dataset.tab === which);
  if (btn) btn.classList.add("active");
  queryEl.dataset.scope = which;
  updateSymbolResults();
}

modalEl?.querySelectorAll(".modal-tabs button").forEach(btn => {
  if (btn.id === "symbol-close") return; // skip close button
  btn.addEventListener("click", () => {
    setActiveSymbolTab(btn.dataset.tab);
    statusCenter(`Symbols tab: ${btn.dataset.tab}`);
  });
});

queryEl?.addEventListener("input", () => {
  updateSymbolResults();
  statusCenter(`Symbol query: "${queryEl.value.trim()}"`);
});

resultsEl?.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-path]");
  if (!li) return;
  const path = li.getAttribute("data-path");
  const line = li.getAttribute("data-line");
  const pattern = li.getAttribute("data-pattern");
  closeSymbolModal();
  await navigateTo(path, line ? Number(line) : null, pattern || null, { record: true });
});

export function fuzzyFilter(list, q, limit = 100) {
  if (!q) return list.slice(0, limit);
  const needle = q.toLowerCase();
  const scored = list.map(item => {
    const hay = String(item.name || "").toLowerCase();
    let si = 0, score = 0;
    for (let i = 0; i < hay.length && si < needle.length; i++) {
      if (hay[i] === needle[si]) { score += 2; si++; } else { score -= 0.1; }
    }
    if (si < needle.length) score -= 10;
    score += Math.max(0, 8 - (hay.length - needle.length));
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.item);
}

export function updateSymbolResults() {
  const scope = queryEl.dataset.scope || "workspace";
  const q = queryEl.value.trim();
  let list = [];
  const active = getActivePath();
  if (scope === "file" && active && symbolsByFile.has(active)) list = symbolsByFile.get(active);
  else list = workspaceTags;
  const matches = fuzzyFilter(list, q, 200);
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
    li.innerHTML = `<span class="codicon codicon-symbol-property"></span><span class="name">${escapeHtml(s.name)}</span><span class="dim">${escapeHtml(shortenPath(s.path))}${s.line ? ':' + s.line : ''}</span>`;
    resultsEl.appendChild(li);
  }
}

function shortenPath(p) {
  const parts = String(p).split("/");
  if (parts.length <= 3) return p;
  return `${parts.slice(0, 1)}/…/${parts.slice(-2).join("/")}`;
}
