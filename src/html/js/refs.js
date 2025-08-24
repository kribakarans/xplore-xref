// refs.js — references modals (file + workspace)
import { openRefsModal, closeRefsModal, refsResults } from "./refs_modal.js";
import { limitConcurrency, escapeRegExp, shortenPath } from "./utils.js";
import { collectAllFiles, isSearchableFile } from "./fs.js";
import { toast } from "./status.js";
import { navigateTo } from "./nav.js";
import { getEditor, getFullTree, getActivePath } from "./editor.js";

export async function findReferencesInFileAtCursor() {
  const model = getEditor().getModel();
  const pos = getEditor().getPosition();
  if (!model || !pos) return;
  const symbol = getWordUnderCursor();
  if (!symbol) return;

  const text = model.getValue();
  const path = getActivePath() || "(unsaved)";
  const needle = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");

  const results = [];
  let match;
  while ((match = needle.exec(text)) && results.length < 500) {
    const pre = text.slice(0, match.index);
    const line = pre.split(/\r?\n/).length;
    const lineStart = text.lastIndexOf("\n", match.index - 1) + 1;
    const lineEnd = text.indexOf("\n", match.index);
    const snippet = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
    results.push({ path, line, snippet });
  }

  openRefsModal(`References in File: ${symbol}`);
  refsResults.innerHTML = "";
  if (results.length === 0) {
    const li = document.createElement("li"); li.className = "empty"; li.textContent = "No references found in this file."; refsResults.appendChild(li);
    toast("No references in this file", "warn"); return;
  }
  for (const r of results) {
    const li = document.createElement("li");
    li.setAttribute("data-path", r.path);
    li.setAttribute("data-line", String(r.line));
    li.innerHTML = `<span class="codicon codicon-references"></span><span class="name">${escapeHtml(shortenPath(r.path))}:${r.line}</span><span class="dim">${escapeHtml(r.snippet)}</span>`;
    li.addEventListener("click", async () => { closeRefsModal(); await navigateTo(r.path, r.line, null, { record: true }); });
    refsResults.appendChild(li);
  }
  toast(`${results.length} references in file`, "info");
}

// deps
import { getWordUnderCursor } from "./editor.js";
import { escapeHtml } from "./utils.js";

export async function findAllReferencesAtCursor() {
  const model = getEditor().getModel();
  const pos = getEditor().getPosition();
  if (!model || !pos) return;
  const symbol = getWordUnderCursor();
  if (!symbol) return;

  openRefsModal(`References: ${symbol}`);
  const files = collectAllFiles(getFullTree()).filter(f => isSearchableFile(f.name, f.mimetype)).slice(0, 200);
  const needle = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");

  const tasks = await limitConcurrency(files.map(f => async () => {
    try {
      const res = await fetch(f.path);
      if (!res.ok) return [];
      const text = await res.text();
      const results = [];
      let match;
      while ((match = needle.exec(text)) && results.length < 20) {
        const pre = text.slice(0, match.index);
        const line = pre.split(/\r?\n/).length;
        const lineStart = text.lastIndexOf("\n", match.index - 1) + 1;
        const lineEnd = text.indexOf("\n", match.index);
        const snippet = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
        results.push({ path: f.path, line, snippet });
      }
      return results;
    } catch { return []; }
  }), 10);

  const found = tasks.flat().slice(0, 500);
  if (found.length === 0) {
    const li = document.createElement("li"); li.className = "empty"; li.textContent = "No references found."; refsResults.appendChild(li);
    toast("No references found", "warn"); return;
  }
  for (const r of found) {
    const li = document.createElement("li");
    li.setAttribute("data-path", r.path);
    li.setAttribute("data-line", String(r.line));
    li.innerHTML = `<span class="codicon codicon-references"></span><span class="name">${escapeHtml(shortenPath(r.path))}:${r.line}</span><span class="dim">${escapeHtml(r.snippet)}</span>`;
    li.addEventListener("click", async () => { closeRefsModal(); await navigateTo(r.path, r.line, null, { record: true }); });
    refsResults.appendChild(li);
  }
  toast(`${found.length} references in workspace`, "info");
}
