// refs.js — smart references with right-side line preview (tags + token-aware usage)
import { openRefsModal, closeRefsModal, refsResults } from "./refs_modal.js";
import { toast, statusCenter } from "./status.js";
import { navigateTo } from "./nav.js";
import { getEditor, getActivePath, getFullTree } from "./editor.js";
import { workspaceTags, symbolsByFile } from "./tags.js";
import { collectAllFiles, isSearchableFile } from "./fs.js";
import { escapeHtml, shortenPath, limitConcurrency, escapeRegExp } from "./utils.js";

/* ---------- Helpers ---------- */
function getWordUnderCursorSafe() {
  try {
    const ed = getEditor();
    const model = ed?.getModel?.();
    const pos = ed?.getPosition?.();
    const w = model && pos ? model.getWordAtPosition(pos) : null;
    return w ? w.word : null;
  } catch { return null; }
}
function setProgress(elId, pct) {
  const el = document.getElementById(elId);
  if (!el) return;
  const bar = el.querySelector(".bar");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}
function resetProgress(elId) { setProgress(elId, 0); }
function lineFromText(text, lineNum) {
  if (!text || !lineNum || lineNum < 1) return "";
  const lines = text.split(/\r?\n/);
  const idx = Math.min(lines.length, lineNum) - 1;
  return (lines[idx] || "").replace(/\t/g, "  ").trim();
}

/* Simple comparator for sorting refs by path, then line */
function sortRefs(list) {
  return list.sort((a, b) => {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return (a.line || 0) - (b.line || 0);
  });
}

/* ---------- Rendering ---------- */
function liForEntry(entry, icon) {
  const li = document.createElement("li");
  li.setAttribute("data-path", entry.path);
  if (entry.line) li.setAttribute("data-line", String(entry.line));
  if (entry.pattern) li.setAttribute("data-pattern", entry.pattern);

  const right = entry.line ? `:${entry.line}` : "";
  const snippet = entry.snippet || entry.dim || "";

  li.innerHTML =
    `<span class="codicon ${icon || ""}"></span>` + /* hidden by CSS */
    `<span class="name">${escapeHtml(shortenPath(entry.path))}${right}</span>` +
    `<span class="dim">${escapeHtml(snippet)}</span>`;

  li.title = snippet || "";
  li.addEventListener("click", async () => {
    closeRefsModal();
    await navigateTo(entry.path, entry.line ?? null, entry.pattern ?? null, { record: true });
  });
  return li;
}
function renderGrouped(title, groups) {
  openRefsModal(title);
  refsResults.innerHTML = "";

  let any = false;
  for (const g of groups) {
    const items = g.items || [];
    if (!items.length) continue;
    any = true;

    const header = document.createElement("li");
    header.className = "outline-section";
    header.innerHTML = `<span class="section-title">${g.title}</span>`;
    refsResults.appendChild(header);

    const ul = document.createElement("ul");
    ul.className = "outline-group";
    for (const it of items) ul.appendChild(liForEntry(it, g.rowIcon));
    refsResults.appendChild(ul);
  }

  if (!any) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No references found.";
    refsResults.appendChild(li);
  }
}

/* Enrich entries with one-line snippet */
async function addSnippets(entries, progressId, concurrency = 8) {
  const byPath = new Map();
  for (const e of entries) {
    if (!e || !e.path || !e.line) continue;
    if (!byPath.has(e.path)) byPath.set(e.path, []);
    byPath.get(e.path).push(e);
  }
  const filePaths = Array.from(byPath.keys());
  if (!filePaths.length) return;

  let done = 0;
  const total = filePaths.length;
  setProgress(progressId, 5);

  await limitConcurrency(filePaths.map(path => async () => {
    try {
      const res = await fetch(path);
      if (!res.ok) return;
      const text = await res.text();
      for (const e of byPath.get(path)) e.snippet = lineFromText(text, e.line);
    } catch {}
    finally {
      done++;
      setProgress(progressId, Math.min(95, Math.round((done / total) * 90) + 5));
    }
  }), concurrency);

  setProgress(progressId, 100);
  setTimeout(() => resetProgress(progressId), 300);
}

/* ---------- Public API ---------- */
export async function findReferencesInFileAtCursor() {
  const symbol = getWordUnderCursorSafe();
  if (!symbol) return;

  const active = getActivePath();
  const tags = (symbolsByFile.get(active) || []).filter(s => s.name === symbol);

  const defs  = tags
    .filter(t => /^(function|method)$/.test((t.kind||"").toLowerCase()))
    .map(d => ({ path: d.path, line: d.line, pattern: d.pattern, dim: d.scope || "" }));

  const decls = tags
    .filter(t => /^(prototype|declaration)$/.test((t.kind||"").toLowerCase()))
    .map(d => ({ path: d.path, line: d.line, pattern: d.pattern, dim: d.scope || "" }));

  const text = getEditor()?.getModel()?.getValue() || "";
  const needle = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");

  const refs = [];
  let m, hits = 0;
  while ((m = needle.exec(text)) && hits < 200) {
    hits++;
    const line = text.slice(0, m.index).split(/\r?\n/).length;
    refs.push({ path: active, line, snippet: lineFromText(text, line) });
  }

  renderGrouped(`References in File: ${symbol}`, [
    { title: "Definitions",  rowIcon: "codicon-symbol-method", items: defs },
    { title: "Declarations", rowIcon: "codicon-symbol-method", items: decls },
    { title: "References",   rowIcon: "codicon-references",    items: sortRefs(refs) },
  ]);

  toast(`${defs.length + decls.length + refs.length} results`, "info");
}

export async function findAllReferencesAtCursor() {
  const symbol = getWordUnderCursorSafe();
  if (!symbol) return;

  const defs  = workspaceTags
    .filter(t => t.name === symbol && /^(function|method)$/.test((t.kind||"").toLowerCase()))
    .map(d => ({ path: d.path, line: d.line, pattern: d.pattern, dim: d.scope || "" }));

  const decls = workspaceTags
    .filter(t => t.name === symbol && /^(prototype|declaration)$/.test((t.kind||"").toLowerCase()))
    .map(d => ({ path: d.path, line: d.line, pattern: d.pattern, dim: d.scope || "" }));

  const tree = getFullTree();
  const files = collectAllFiles(tree)
    .filter(f => isSearchableFile(f.name, f.mimetype))
    .slice(0, 300);

  setProgress("refs-progress", 0);
  const total = files.length || 1;
  let done = 0;

  const refs = [];
  const needle = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "g");

  await limitConcurrency(files.map(f => async () => {
    try {
      const res = await fetch(f.path);
      if (!res.ok) { done++; setProgress("refs-progress", (done/total)*100); return; }
      const text = await res.text();

      let m, count = 0;
      while ((m = needle.exec(text)) && count < 20) {
        count++;
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        refs.push({ path: f.path, line, snippet: lineFromText(text, line) });
      }
    } catch {}
    finally {
      done++;
      setProgress("refs-progress", Math.round((done/total)*100));
    }
  }), 10);

  await addSnippets([...defs, ...decls], "refs-progress", 8);

  renderGrouped(`References: ${symbol}`, [
    { title: "Definitions",  rowIcon: "codicon-symbol-method", items: defs },
    { title: "Declarations", rowIcon: "codicon-symbol-method", items: decls },
    { title: "References",   rowIcon: "codicon-references",    items: sortRefs(refs) },
  ]);

  statusCenter(`References computed for "${symbol}"`);
  toast(`Found ${defs.length + decls.length + refs.length} results`, "info");
  setTimeout(() => resetProgress("refs-progress"), 300);
}
