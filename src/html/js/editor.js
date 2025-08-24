// editor.js — Monaco editor + tabs
import { statusCenter, updateCursorStatus, setFileStatus, toast } from "./status.js";
import { detectLanguageByFilename, getLanguageFromExt } from "./lang.js";
import { renderOutline } from "./outline.js";
import { updatePreviewButtonVisibility, applyPreviewVisibility, renderPreview, getPreviewOn, setPreviewOn } from "./preview.js";
import { openSymbolModal } from "./symbols.js";
import { findReferencesInFileAtCursor, findAllReferencesAtCursor } from "./refs.js";
import { navigateTo } from "./nav.js";

// --- blink state
let __blinkDecorations = [];

let editor;
let openTabs = [];
let activePath = null;
let fullTree = null;

// limit of open tabs
const MAX_TABS = 10;

// context key to control symbol menu visibility
let hasSymbolCtx = null;

export function setFullTree(tree){ fullTree = tree; }
export function getFullTree(){ return fullTree; }
export function getEditor(){ return editor; }
export function getActivePath(){ return activePath; }
export function getActiveTab(){ return openTabs.find(t => t.path === activePath) || null; }

// 🔹 Exported helper to blink a line in the active editor
export function blinkLine(lineNumber) {
  if (!editor || !lineNumber || lineNumber < 1) return;
  try {
    __blinkDecorations = editor.deltaDecorations(
      __blinkDecorations,
      [{
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: { isWholeLine: true, className: "xplore-line-blink" }
      }]
    );
    setTimeout(() => {
      try { __blinkDecorations = editor.deltaDecorations(__blinkDecorations, []); } catch {}
    }, 1200);
  } catch {}
}

// Keep the active tab visible within the tab tray
function scrollActiveTabIntoView(tabEl) {
  const bar = document.getElementById("tabs");
  if (!bar || !tabEl) return;
  const br = bar.getBoundingClientRect();
  const er = tabEl.getBoundingClientRect();
  if (er.left < br.left) {
    bar.scrollLeft += er.left - br.left - 16;
  } else if (er.right > br.right) {
    bar.scrollLeft += er.right - br.right + 16;
  }
}

function enforceTabLimit() {
  while (openTabs.length >= MAX_TABS) {
    // close the oldest non-active tab; if all else fails, close the oldest
    const victim = openTabs.find(t => t.path !== activePath) || openTabs[0];
    if (!victim) break;
    closeTab(victim.path);
  }
}

export function openTab(file, location) {
  const existing = openTabs.find(t => t.path === file.path);
  if (existing) { setActiveTab(existing.path, location || null); toast(`Activated: ${file.path}`); return; }

  enforceTabLimit();

  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  tabEl.textContent = file.name;

  const closeBtn = document.createElement("span");
  closeBtn.className = "close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeTab(file.path); });

  tabEl.appendChild(closeBtn);
  tabEl.addEventListener("click", () => setActiveTab(file.path));
  document.getElementById("tabs").appendChild(tabEl);

  openTabs.push({ path: file.path, name: file.name, content: file.content, tabEl });
  setActiveTab(file.path, location || null);
  scrollActiveTabIntoView(tabEl);   // keep it visible
  toast(`Opened: ${file.path}`);
}

export function closeTab(path) {
  const index = openTabs.findIndex(t => t.path === path);
  if (index !== -1) {
    openTabs[index].tabEl.remove();
    openTabs.splice(index, 1);
    toast(`Closed: ${path}`);
    if (activePath === path && openTabs.length > 0) setActiveTab(openTabs[openTabs.length - 1].path);
    else if (openTabs.length === 0) {
      editor.setValue(""); activePath = null; renderOutline(null); setFileStatus(null, null);
      setPreviewOn(false); applyPreviewVisibility();
      renderBreadcrumbs("");  // clear
    }
  }
}

export function setActiveTab(path, location = null) {
  activePath = path;
  openTabs.forEach(tab => tab.tabEl.classList.toggle("active", tab.path === path));
  const activeFile = openTabs.find(t => t.path === path);
  if (!activeFile) return;

  const byName = detectLanguageByFilename(activeFile.name);
  const ext = activeFile.name.includes(".") ? activeFile.name.split(".").pop().toLowerCase() : activeFile.name.toLowerCase();
  let lang = byName || getLanguageFromExt(ext);

  try { monaco.editor.setModelLanguage(editor.getModel(), lang); }
  catch { lang = "plaintext"; monaco.editor.setModelLanguage(editor.getModel(), lang); }

  editor.setValue(activeFile.content);
  setFileStatus(activeFile.path, lang);
  updateCursorStatus(editor);
  renderOutline(path);

  const isMd = /\.md(?:|own)?$|\.markdown$/i.test(activeFile.name);
  if (isMd) {
    setPreviewOn(true);
    applyPreviewVisibility();
    updatePreviewButtonVisibility();
    renderPreview().catch(()=>{});
  } else {
    updatePreviewButtonVisibility();
    if (getPreviewOn()) renderPreview().catch(()=>{});
  }

  updateSymbolContext();      // menu visibility
  renderBreadcrumbs(path);    // breadcrumbs

  // ensure the active tab is visible in the tray
  scrollActiveTabIntoView(activeFile.tabEl);

  if (location) setTimeout(() => goToLocation(path, location.line, location.pattern), 0);
}

export function createMonacoEditor() {
  require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
  require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor"), {
      value: "", language: "plaintext", theme: "vs-dark",
      automaticLayout: true, readOnly: true, minimap: { enabled: true }, wordWrap: "off"
    });

    // context key to control menu visibility
    hasSymbolCtx = editor.createContextKey("xplore.hasSymbol", false);
    updateSymbolContext();

    addContextMenuActions();

    editor.onDidChangeCursorPosition(() => {
      updateCursorStatus(editor);
      updateSymbolContext();
    });
    editor.onDidLayoutChange(() => updateCursorStatus(editor));

    updateCursorStatus(editor);
    statusCenter("Editor ready");
  });
}

function goToLocation(path, line = null, pattern = null) {
  if (typeof line === "number" && line > 0) {
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    blinkLine(line);
    updateCursorStatus(editor);
    return;
  }
  if (pattern && typeof pattern === "string") {
    const m = pattern.match(/^\/(.*)\/(?:[a-z]*)$/);
    const body = m ? m[1] : pattern;
    try {
      const re = new RegExp(body, "m");
      const content = editor.getModel().getValue();
      const match = re.exec(content);
      if (match) {
        const pre = content.slice(0, match.index);
        const lineNum = pre.split(/\r?\n/).length;
        editor.revealLineInCenter(lineNum);
        editor.setPosition({ lineNumber: lineNum, column: 1 });
        editor.focus();
        blinkLine(lineNum);
        updateCursorStatus(editor);
        return;
      }
    } catch {}
  }
}

export function getWordUnderCursor() {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return null;
  const w = model.getWordAtPosition(pos);
  return w ? w.word : null;
}

/* ---------- Breadcrumbs (leaf is non-clickable now) ---------- */
function renderBreadcrumbs(path) {
  const el = document.getElementById("breadcrumbs");
  if (!el) return;
  el.innerHTML = "";
  if (!path) return;

  const parts = String(path).split("/").filter(Boolean);
  let accum = "";
  parts.forEach((seg, idx) => {
    accum += (idx ? "/" : "") + seg;
    const isLeaf = idx === parts.length - 1;

    const crumb = document.createElement("span");
    crumb.className = "crumb" + (isLeaf ? " leaf" : " clickable");
    crumb.textContent = seg;

    if (!isLeaf) {
      // Parents: expand the folder in the tree
      crumb.addEventListener("click", () => {
        expandFolderPath(accum);
      });
    } else {
      // Leaf: do nothing (no navigation). Optional: focus editor for convenience.
      crumb.addEventListener("click", () => {
        document.getElementById("editor")?.focus();
      });
    }

    el.appendChild(crumb);
    if (!isLeaf) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      el.appendChild(sep);
    }
  });
}

function expandFolderPath(dirPath) {
  // Find the li for this directory and expand/show it
  const li = document.querySelector(`#file-tree li.folder[data-path="${CSS.escape(dirPath)}"]`)
           || document.querySelector(`#file-tree li.folder[data-path="./${CSS.escape(dirPath)}"]`);
  if (!li) return;
  const sub = li.querySelector(":scope > ul");
  if (sub) {
    li.classList.add("expanded");
    sub.style.display = "block";
    li.scrollIntoView({ block: "nearest" });
  }
}

/* ---------- Context key: show/hide symbol actions ---------- */
function isValidSymbol(word) {
  if (!word) return false;
  // C/C++ style identifiers, allow :: namespaces
  return /^(?:[A-Za-z_][A-Za-z0-9_]*)(?:::[A-Za-z_][A-Za-z0-9_]*)*$/.test(word);
}
function updateSymbolContext() {
  try {
    const w = getWordUnderCursor();
    hasSymbolCtx?.set(isValidSymbol(w));
  } catch {}
}

/* ===== Context menu: cscope-like minimal set ===== */
export function addContextMenuActions() {
  // Go to Definition
  editor.addAction({
    id: "ctx-goto-definition",
    label: "Go to Definition",
    keybindings: [monaco.KeyCode.F12],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    precondition: "xplore.hasSymbol",
    run: async () => { await gotoDefinitionAtCursor(); }
  });

  // Go to Declaration
  editor.addAction({
    id: "ctx-goto-declaration",
    label: "Go to Declaration",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.6,
    precondition: "xplore.hasSymbol",
    run: async () => { await gotoDeclarationAtCursor(); }
  });

  // Go to References
  editor.addAction({
    id: "ctx-goto-references",
    label: "Go to References",
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.7,
    precondition: "xplore.hasSymbol",
    run: async () => { await findReferencesInFileAtCursor(); }
  });

  // Find All References
  editor.addAction({
    id: "ctx-find-all-references",
    label: "Find All References",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.8,
    precondition: "xplore.hasSymbol",
    run: async () => { await findAllReferencesAtCursor(); }
  });
}

// Definition/Declaration helpers via tags
import { workspaceTags, symbolsByFile } from "./tags.js";
import { inferTypeFromLine, rankBySourcePref } from "./lang.js";

async function gotoDefinitionAtCursor() {
  const symbol = getWordUnderCursor(); 
  if (!symbol) return;

  const isHeader = (p) => /\.(h|hpp|hh|hxx)$/i.test(p || "");
  const isSource = (p) => /\.(c|cc|cpp|cxx|m|mm|java|go|rs|js|ts)$/i.test(p || "");
  const stem = (p) => {
    const m = String(p || "").split("/").pop();
    if (!m) return "";
    const i = m.lastIndexOf(".");
    return i > 0 ? m.slice(0, i) : m;
  };
  const looksDefinition = (s) => {
    const k = String(s.kind || "").toLowerCase();
    if (k === "function" || k === "method") return true;
    if (isSource(s.path) && (s.signature || (s.pattern && /\(.*\)/.test(s.pattern)))) return true;
    return false;
  };

  const local = (symbolsByFile.get(activePath) || []).filter(s => s.name === symbol);
  const global = workspaceTags.filter(s => s.name === symbol);
  const all = [...local, ...global];

  if (all.length === 0) { try { await editor.getAction("editor.action.revealDefinition").run(); } catch {} return; }

  const defs = all.filter(looksDefinition);
  let candidates = defs.length ? defs : all;

  const activeStem = stem(activePath);
  const score = (s) => {
    let sc = 0;
    if (isSource(s.path)) sc += 5;
    if (!isHeader(s.path)) sc += 1;
    if (stem(s.path) === activeStem) sc += 2;
    if (s.path !== activePath) sc += 1;
    return sc;
  };

  candidates.sort((a, b) => score(b) - score(a) || rankBySourcePref(a.path) - rankBySourcePref(b.path));
  const best = candidates[0];
  await navigateTo(best.path, best.line || null, best.pattern || null, { record: true });
  statusCenter(`Definition: ${symbol} → ${best.path}:${best.line || '?'}`);
}

async function gotoDeclarationAtCursor() {
  const symbol = getWordUnderCursor(); 
  if (!symbol) return;

  const isHeader = (p) => /\.(h|hpp|hh|hxx)$/i.test(p || "");
  const isSource = (p) => /\.(c|cc|cpp|cxx|m|mm|java|go|rs|js|ts)$/i.test(p || "");
  const stem = (p) => {
    const m = String(p || "").split("/").pop() || "";
    const i = m.lastIndexOf(".");
    return i > 0 ? m.slice(0, i) : m;
  };
  const looksDeclaration = (s) => {
    const k = String(s.kind || "").toLowerCase();
    if (k === "declaration" || k === "prototype" || k === "typedef" || k === "macro") return true;
    if (isHeader(s.path) && !(k === "function" || k === "method")) return true;
    return false;
  };

  const local  = (symbolsByFile.get(activePath) || []).filter(s => s.name === symbol);
  const global = workspaceTags.filter(s => s.name === symbol);

  let candidates = [...local.filter(looksDeclaration), ...global.filter(looksDeclaration)];
  if (candidates.length === 0) candidates = [...local, ...global].filter(s => isHeader(s.path));

  if (candidates.length === 0) { try { await editor.getAction("editor.action.revealDeclaration").run(); } catch {} return; }

  const activeStem = stem(activePath);
  const score = (s) => {
    let sc = 0;
    if (isHeader(s.path)) sc += 5;
    if (stem(s.path) === activeStem) sc += 2;
    if (!isSource(s.path)) sc += 1;
    return sc;
  };

  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  await navigateTo(best.path, best.line || null, best.pattern || null, { record: true });
  statusCenter(`Declaration: ${symbol} → ${best.path}:${best.line || '?'}`);
}
