let openTabs = [];
let activePath = null;
let openFilesCache = {};

// === Symbols data ===
let workspaceTags = [];         // flat list of all tags
let symbolsByFile = new Map();  // path -> tag[]

// ===== Status Bar & Toast =====
let __toastTimer = null;
function toast(msg, type = 'info', timeout = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = '';
  el.textContent = String(msg || '');
  el.classList.add(type);
  void el.offsetWidth; // reflow
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    el.classList.remove('show', 'info', 'warn', 'error');
  }, timeout);
  statusCenter(msg); // also mirror into status bar center
}

function statusLeft(text) {
  const el = document.getElementById('status-left');
  if (el) el.innerHTML = text;
}
function statusCenter(text) {
  const el = document.getElementById('status-center');
  if (el) el.textContent = text;
}
function statusRight(text) {
  const el = document.getElementById('status-right');
  if (el) el.textContent = text;
}
function updateCursorStatus() {
  if (!editor) return;
  const pos = editor.getPosition();
  const wrap = editor.getOption(monaco.editor.EditorOption.wordWrap);
  const mini = editor.getOption(monaco.editor.EditorOption.minimap).enabled;
  statusRight(`Ln ${pos?.lineNumber || 1}, Col ${pos?.column || 1} • WRAP: ${wrap === 'on' ? 'ON' : 'OFF'} • MINIMAP: ${mini ? 'ON' : 'OFF'}`);
}
function setFileStatus(path, lang) {
  statusLeft(`<span class="codicon codicon-file"></span> ${escapeHtml(shortenPath(path || '—'))} • ${lang || 'plaintext'}`);
}

/* ===========================
   Navigation History (Back/Forward)
   =========================== */
const MAX_HISTORY = 20;
const backStack = [];
const fwdStack  = [];

function currentLocation() {
  if (!activePath || !editor) return null;
  const pos = editor.getPosition();
  return { path: activePath, line: pos ? pos.lineNumber : null, pattern: null };
}
function sameLoc(a, b) {
  if (!a || !b) return false;
  return a.path === b.path &&
         (a.line || null) === (b.line || null) &&
         (a.pattern || null) === (b.pattern || null);
}
function pushBack(loc, opts = { clearForward: true }) {
  if (!loc) return;
  if (backStack.length && sameLoc(backStack[backStack.length - 1], loc)) return;
  backStack.push(loc);
  while (backStack.length > MAX_HISTORY) backStack.shift();
  if (opts.clearForward) fwdStack.length = 0;
  updateNavButtons();
}
function pushForward(loc) {
  if (!loc) return;
  if (fwdStack.length && sameLoc(fwdStack[fwdStack.length - 1], loc)) return;
  fwdStack.push(loc);
  while (fwdStack.length > MAX_HISTORY) fwdStack.shift();
  updateNavButtons();
}
function updateNavButtons() {
  const backBtn = document.getElementById('nav-back');
  const fwdBtn  = document.getElementById('nav-forward');
  if (backBtn) backBtn.style.opacity = backStack.length ? '1' : '0.5';
  if (fwdBtn)  fwdBtn.style.opacity  = fwdStack.length  ? '1' : '0.5';
}
async function goBack() {
  if (!backStack.length) { toast("Back history empty", "warn"); return; }
  const here = currentLocation();
  const target = backStack.pop();
  if (here) pushForward(here);
  await navigateTo(target.path, target.line, target.pattern, { record: false });
  statusCenter(`Back: ${shortenPath(target.path)}:${target.line || '?'}`);
  toast("Went back", "info");
}
async function goForward() {
  if (!fwdStack.length) { toast("Forward history empty", "warn"); return; }
  const here = currentLocation();
  const target = fwdStack.pop();
  if (here) pushBack(here, { clearForward: false }); // keep remaining forward chain
  await navigateTo(target.path, target.line, target.pattern, { record: false });
  statusCenter(`Forward: ${shortenPath(target.path)}:${target.line || '?'}`);
  toast("Went forward", "info");
}
// Unified navigate function to ensure history is recorded consistently
async function navigateTo(path, line = null, pattern = null, opts = { record: true }) {
  if (opts.record) {
    const origin = currentLocation();
    if (origin) pushBack(origin); // new nav clears forward by default
  }
  await loadFile(path, { line, pattern });
  updateNavButtons();
}

/* ===========================
   Preview (Markdown/HTML + Binary)
   =========================== */
let previewOn = false;

/* --- Template loader + helpers (for external preview templates) --- */
const __tplCache = new Map();

async function loadTemplate(name, vars = {}) {
  const url = "__xplore/templates/" + name;
  let text = __tplCache.get(url);
  if (!text) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load template: " + url);
    text = await res.text();
    __tplCache.set(url, text);
  }
  // Replace {{KEY}} placeholders (global)
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp("\\{\\{"+k+"\\}\\}", "g");
    out = out.replace(re, String(v));
  }
  return out;
}

// Base64 encoder safe for Unicode
function toB64Unicode(s) {
  try { return btoa(unescape(encodeURIComponent(s))); }
  catch { return btoa(s); }
}

// --- Preview failover: return to Monaco editor (no raw content) ---
function giveUpPreview(msg) {
  previewOn = false;
  applyPreviewVisibility();        // show editor, hide iframe
  if (msg) statusCenter(msg);
  toast("Preview failed — back to editor", "warn");
}

// Listen for failure signals from preview iframes (e.g., Markdown)
window.addEventListener("message", (e) => {
  try {
    if (e && e.data && e.data.type === "xplore-md-failed") {
      giveUpPreview("Preview error in Markdown iframe");
    }
  } catch {}
});

function canPreviewName(fileName) {
  if (!fileName) return false;
  const n = fileName.toLowerCase();
  return n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.html') || n.endsWith('.htm');
}
function canPreviewBinaryName(fileName) {
  if (!fileName) return false;
  const n = fileName.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|mp4|webm|ogv|pdf|docx|xlsx|xls|csv|pptx)$/.test(n);
}
function updatePreviewButtonVisibility() {
  const btn = document.getElementById('editor-preview');
  const tab = openTabs.find(t => t.path === activePath);
  let ok = false;

  if (tab) {
    ok = canPreviewName(tab.name) || canPreviewBinaryName(tab.name);
  }

  if (!btn) return;

  // show or hide the toggle button based on file type
  btn.style.display = ok ? 'inline-block' : 'none';

  // if preview isn’t supported for this file, force it off
  if (!ok && previewOn) {
    previewOn = false;
  }

  // always resync UI state
  applyPreviewVisibility();
}
function applyPreviewVisibility() {
  const editorEl = document.getElementById('editor');
  const previewEl = document.getElementById('preview');
  const btn = document.getElementById('editor-preview');
  if (!editorEl || !previewEl) return;

  if (previewOn) {
    // show preview iframe, hide Monaco editor
    editorEl.style.display = 'none';
    previewEl.classList.add('show');
  } else {
    // show Monaco editor, hide preview iframe
    previewEl.classList.remove('show');
    editorEl.style.display = 'block';
  }

  // --- Keep the toggle button in sync ---
  if (btn) {
    btn.classList.toggle('active', previewOn);
    btn.setAttribute('aria-pressed', previewOn ? 'true' : 'false');
    btn.title = previewOn ? 'Preview ON (click to hide)' : 'Preview OFF (click to show)';
  }
}

async function renderPreview() {
  const tab = openTabs.find(t => t.path === activePath);
  if (!tab) return;
  const frame = document.getElementById('preview-frame');
  if (!frame) return;

  const name = (tab.name || '').toLowerCase();
  const path = tab.path;

  // ---------- Markdown via external template (iframe) ----------
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    const b64 = toB64Unicode(tab.content || "");
    try {
      const html = await loadTemplate("preview_md.html", {
        TITLE: escapeHtml(tab.name || "Markdown"),
        CONTENT_B64: b64
      });
      frame.srcdoc = html;
    } catch (e) {
      giveUpPreview("Markdown preview template missing or failed to load");
    }
    return;
  }

  // ---------- Raw HTML (render as-is) ----------
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    frame.srcdoc = tab.content || '';
    return;
  }

  // ---------- Images ----------
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
    const html = await loadTemplate("preview_img.html", {
      TITLE: escapeHtml(tab.name),
      SRC: encodeURI(path),
      ALT: escapeHtml(tab.name)
    });
    frame.srcdoc = html;
    return;
  }

  // ---------- Audio ----------
  if (/\.(mp3|ogg|wav)$/.test(name)) {
    const html = await loadTemplate("preview_audio.html", {
      TITLE: escapeHtml(tab.name),
      SRC: encodeURI(path),
      NAME: escapeHtml(tab.name)
    });
    frame.srcdoc = html;
    return;
  }

  // ---------- Video ----------
  if (/\.(mp4|webm|ogv)$/.test(name)) {
    const html = await loadTemplate("preview_video.html", {
      TITLE: escapeHtml(tab.name),
      SRC: encodeURI(path)
    });
    frame.srcdoc = html;
    return;
  }

  // ---------- PDF ----------
  if (/\.pdf$/.test(name)) {
    frame.removeAttribute('srcdoc');
    frame.setAttribute('src', path);
    return;
  }

  // ---------- DOCX (Mammoth if present) ----------
  if (/\.docx$/.test(name)) {
    try {
      const res = await fetch(path);
      const buf = await res.arrayBuffer();
      if (window.mammoth) {
        const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        const html = await loadTemplate("preview_docx.html", {
          TITLE: escapeHtml(tab.name),
          BODY_HTML: result.value || "<p>(Empty)</p>"
        });
        frame.srcdoc = html;
      } else {
        const html = await loadTemplate("preview_fallback.html", {
          TITLE: "DOCX preview not available",
          MESSAGE: "Include <b>Mammoth.js</b> (mammoth.browser.min.js) to enable DOCX preview.",
          FILE: escapeHtml(path)
        });
        frame.srcdoc = html;
      }
    } catch {
      const html = await loadTemplate("preview_fallback.html", {
        TITLE: "Failed to load DOCX",
        MESSAGE: "An error occurred while loading the document.",
        FILE: escapeHtml(path)
      });
      frame.srcdoc = html;
    }
    return;
  }

  // ---------- XLSX/XLS/CSV (SheetJS if present) ----------
  if (/\.(xlsx|xls|csv)$/.test(name)) {
    try {
      const res = await fetch(path);
      const buf = await res.arrayBuffer();
      if (window.XLSX) {
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const tableHtml = XLSX.utils.sheet_to_html(sheet, { header: "<h3>"+escapeHtml(tab.name)+"</h3>" });
        const html = await loadTemplate("preview_xlsx.html", {
          TITLE: escapeHtml(tab.name),
          TABLE_HTML: tableHtml
        });
        frame.srcdoc = html;
      } else {
        const html = await loadTemplate("preview_fallback.html", {
          TITLE: "Spreadsheet preview not available",
          MESSAGE: "Include <b>SheetJS</b> (xlsx.full.min.js) to enable spreadsheet preview.",
          FILE: escapeHtml(path)
        });
        frame.srcdoc = html;
      }
    } catch {
      const html = await loadTemplate("preview_fallback.html", {
        TITLE: "Failed to load spreadsheet",
        MESSAGE: "An error occurred while loading the file.",
        FILE: escapeHtml(path)
      });
      frame.srcdoc = html;
    }
    return;
  }

  // ---------- PPTX ----------
  if (/\.pptx$/.test(name)) {
    const html = await loadTemplate("preview_pptx.html", {
      TITLE: escapeHtml(tab.name),
      FILE: escapeHtml(path)
    });
    frame.srcdoc = html;
    return;
  }

  // ---------- Fallback ----------
  frame.srcdoc = await loadTemplate("preview_fallback.html", {
    TITLE: "Preview not supported",
    MESSAGE: "This file type is not supported for preview.",
    FILE: escapeHtml(tab.name)
  });
}

// ===== Tabs =====
function openTab(file) {
  console.log("[Tab] Opening file:", file.path);
  const existing = openTabs.find(t => t.path === file.path);
  if (existing) {
    console.log("[Tab] Already open, activating:", file.path);
    setActiveTab(existing.path, file.location || null);
    toast(`Activated: ${file.path}`);
    return;
  }
  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  tabEl.textContent = file.name;

  const closeBtn = document.createElement("span");
  closeBtn.className = "close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    console.log("[Tab] Closing:", file.path);
    closeTab(file.path);
  });

  tabEl.appendChild(closeBtn);
  tabEl.addEventListener("click", () => setActiveTab(file.path));
  document.getElementById("tabs").appendChild(tabEl);

  openTabs.push({ path: file.path, name: file.name, content: file.content, tabEl });
  setActiveTab(file.path, file.location || null);
  toast(`Opened: ${file.path}`);
}

function closeTab(path) {
  console.log("[Tab] Closing tab:", path);
  const index = openTabs.findIndex(t => t.path === path);
  if (index !== -1) {
    openTabs[index].tabEl.remove();
    openTabs.splice(index, 1);
    toast(`Closed: ${path}`);
    if (activePath === path && openTabs.length > 0) {
      setActiveTab(openTabs[openTabs.length - 1].path);
    } else if (openTabs.length === 0) {
      editor.setValue("");
      activePath = null;
      renderOutline(null);
      setFileStatus(null, null);
      // Reset preview state if no tabs
      previewOn = false;
      applyPreviewVisibility();
    }
  }
}

let editor;
let selectedItem = null;
let fullTree = null;

function findReadme(tree) {
  const readmeNames = ['README.md', 'INDEX.md'];
  function search(nodes) {
    for (const node of nodes) {
      if (node.type === 'file' && readmeNames.includes(node.name)) return node;
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree);
}

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(["vs/editor/editor.main"], async function () {
  console.log("[Init] Monaco Editor starting...");
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    readOnly: true,
    minimap: { enabled: true },
    wordWrap: "off"
  });

  addContextMenuActions();

  // Status: cursor position updates
  editor.onDidChangeCursorPosition(updateCursorStatus);
  editor.onDidLayoutChange(updateCursorStatus);
  updateCursorStatus();
  statusCenter("Editor ready");

  // Hook back/forward buttons if present
  const backBtn = document.getElementById('nav-back');
  const fwdBtn  = document.getElementById('nav-forward');
  if (backBtn) backBtn.addEventListener('click', goBack);
  if (fwdBtn)  fwdBtn.addEventListener('click', goForward);
  updateNavButtons();

  console.log("[Tree] Loading full directory tree...");
  fullTree = await loadFullTree();
  console.log("[Tree] Full structure:", fullTree);
  renderTree(fullTree, document.getElementById("file-tree"));
  toast("Tree loaded");

  console.log("[Tags] Loading workspace tags…");
  await loadWorkspaceTags();

  // Auto-load README on startup
  const readme = findReadme(fullTree);
  if (readme) {
    await loadFile(readme.path);
  }

  const searchToggle = document.getElementById("search-toggle");
  const searchInput = document.getElementById("file-search");

  searchToggle.addEventListener("click", () => {
    const show = searchInput.style.display === "none";
    searchInput.style.display = show ? "block" : "none";
    if (show) {
      searchInput.focus();
      toast("File search shown");
    } else {
      searchInput.value = "";
      renderTree(fullTree, document.getElementById("file-tree"), false);
      toast("File search hidden");
    }
  });

  // File-tree search
  searchInput.addEventListener("input", function () {
    const query = this.value.trim().toLowerCase();
    if (!query) {
      renderTree(fullTree, document.getElementById("file-tree"), false);
      statusCenter("File search cleared");
      return;
    }
    const filtered = searchTree(query, fullTree);
    renderTree(filtered, document.getElementById("file-tree"), true);
    statusCenter(`File search: "${query}"`);
  });

  document.getElementById("editor-minimap").addEventListener("click", () => {
    const current = editor.getOption(monaco.editor.EditorOption.minimap).enabled;
    editor.updateOptions({ minimap: { enabled: !current } });
    updateCursorStatus();
    toast(`Minimap ${!current ? 'ON' : 'OFF'}`);
  });

  document.getElementById("editor-wrap").addEventListener("click", () => {
    const current = editor.getOption(monaco.editor.EditorOption.wordWrap);
    const next = current === "on" ? "off" : "on";
    editor.updateOptions({ wordWrap: next });
    updateCursorStatus();
    toast(`Word Wrap ${next === 'on' ? 'ON' : 'OFF'}`);
  });

  document.getElementById("editor-symbols").addEventListener("click", () => {
    editor.getAction("editor.action.quickOutline").run();
    toast("Quick Outline (Monaco)");
  });

  document.getElementById("editor-search").addEventListener("click", () => {
    editor.getAction("actions.find").run();
    toast("Find in File");
  });

  // Preview toggle button
  const previewBtn = document.getElementById("editor-preview");
  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      const tab = openTabs.find(t => t.path === activePath);
      if (!tab || !(canPreviewName(tab.name) || canPreviewBinaryName(tab.name))) {
        toast("Preview supports .html/.md and common media/docs", "warn");
        return;
      }
      previewOn = !previewOn;
      applyPreviewVisibility();
      if (previewOn) { renderPreview().catch(()=>{}); }
      const mode = previewOn ? "ON" : "OFF";
      toast(`Preview ${mode}`);
      statusCenter(`Preview ${mode} for ${tab.name}`);
    });
  }

  // Symbol palette buttons
  const wsBtn = document.getElementById("workspace-symbols");
  const fileBtn = document.getElementById("file-symbols");
  if (wsBtn) wsBtn.addEventListener("click", () => { openSymbolModal('workspace'); toast("Workspace Symbols"); });
  if (fileBtn) fileBtn.addEventListener("click", () => { openSymbolModal('file'); toast("File Symbols"); });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 't') {
      e.preventDefault();
      openSymbolModal('workspace');
      toast("Workspace Symbols (Ctrl+T)");
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openSymbolModal('file');
      toast("File Symbols (Ctrl+Shift+O)");
    } else if (e.key === 'Escape') {
      closeSymbolModal();
      closeRefsModal();
      statusCenter("Dismissed modals");
    } else if (altKey(e) && e.key === 'ArrowLeft') {
      e.preventDefault(); goBack();
    } else if (altKey(e) && e.key === 'ArrowRight') {
      e.preventDefault(); goForward();
    }
  });
});
function altKey(e){ return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey; }

// Load static tree.json
async function loadFullTree() {
  const res = await fetch("__xplore/tree.json");
  return await res.json();
}

// Render tree
function renderTree(data, container, autoExpandParents = false) {
  container.innerHTML = "";
  data.forEach(item => {
    const li = document.createElement("li");
    li.classList.add(item.type);

    if (item.type === "dir") {
      li.classList.add("folder");
      const arrow = document.createElement("span");
      arrow.classList.add("arrow");
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("name");
      nameSpan.textContent = item.name;
      li.appendChild(arrow);
      li.appendChild(nameSpan);

      const subUl = document.createElement("ul");
      subUl.style.display = "none";

      if (autoExpandParents && item.children && item.children.length > 0) {
        li.classList.add("expanded");
        subUl.style.display = "block";
      }

      li.addEventListener("click", (e) => {
        e.stopPropagation();
        if (li.classList.contains("expanded")) {
          li.classList.remove("expanded");
          subUl.style.display = "none";
          statusCenter(`Collapsed: ${item.path}`);
        } else {
          li.classList.add("expanded");
          subUl.style.display = "block";
          statusCenter(`Expanded: ${item.path}`);
        }
      });

      if (item.children && item.children.length) {
        renderTree(item.children, subUl, autoExpandParents);
      }
      li.appendChild(subUl);
    } else {
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("name");
      nameSpan.textContent = item.name;
      li.appendChild(nameSpan);
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        selectItem(li);
        // Use navigateTo so history records
        navigateTo(item.path, null, null, { record: true });
        statusCenter(`Open file: ${item.path}`);
      });
    }
    container.appendChild(li);
  });
}

// Search tree (keeps hierarchy)
function searchTree(query, nodes) {
  const results = [];
  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(query);
    if (node.type === "dir") {
      const childMatches = searchTree(query, node.children || []);
      if (nameMatch || childMatches.length > 0) {
        results.push({ ...node, children: nameMatch ? node.children : childMatches });
      }
    } else if (nameMatch) {
      results.push(node);
    }
  }
  return results;
}

// Load a file (static fetch)
async function loadFile(path, location = null) {
  try {
    const res = await fetch(`${path}`);
    if (!res.ok) {
      toast(`Error loading file: ${path}`, "error", 3000);
      return;
    }
    const text = await res.text();
    const name = path.split("/").pop();
    openTab({ name, path, content: text, binary: false, location });
  } catch (err) {
    console.error("[Error] Loading file:", err);
    toast(`Load failed: ${path}`, "error", 3000);
  }
}

function selectItem(li) {
  if (selectedItem) selectedItem.classList.remove("selected");
  selectedItem = li;
  selectedItem.classList.add("selected");
}

/* ===========================
   Language detection & mapping
   =========================== */

// Map well-known filenames (no/ext) to Monaco language IDs.
// Recommended path: keep Monaco plaintext for Makefiles and .vimrc,
// rely on highlight.js (GitHub style) in Markdown preview for code colors.
function detectLanguageByFilename(name) {
  const n = String(name || "");

  // Dockerfile
  if (/^Dockerfile$/i.test(n)) return "dockerfile";

  // Doxygen configs → closest is INI
  if (/^(Doxyfile|doxygen\.cfg)$/i.test(n)) return "ini";
  if (/\.doxy$/i.test(n)) return "ini";

  // Makefiles → keep Monaco plaintext (we use hljs in preview contexts)
  if (/^Makefile$/i.test(n)) return "plaintext";
  if (/\.mk$/i.test(n)) return "plaintext";
  if (/\.make$/i.test(n)) return "plaintext";

  // Shell rc files
  if (/^\.(bashrc)$/i.test(n)) return "shell";

  // Vim config (no Monaco vim lexer) → plaintext in editor
  if (/^\.(vimrc)$/i.test(n)) return "plaintext";

  return null;
}

// Map file extensions to Monaco languages
function getLanguageFromExt(ext) {
  const map = {
    js: "javascript", py: "python", pyw: "python", html: "html", css: "css", json: "json",
    md: "markdown", txt: "plaintext", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp",
    php: "php", rb: "ruby", go: "go", rs: "rust", ts: "typescript", sh: "shell", aliases: "shell",
    rc: "shell", in: "shell", vim: "plaintext", lua: "lua", cfg: "ini", yml: "yaml",
    toml: "ini", yaml: "yaml", makefile: "plaintext", tsx: "typescriptreact", jsx: "javascriptreact",
    bash: "shell", zsh: "shell", ksh: "shell", mjs: "javascript", cjs: "javascript",
    dockerfile: "dockerfile", ini: "ini", mk: "plaintext", make: "plaintext"
  };
  return map[ext] || "plaintext";
}

/* ===========================
   setActiveTab — MD auto-preview; Monaco plaintext for Makefiles/.vimrc
   =========================== */
function setActiveTab(path, location = null) {
  console.log("[Tab] Setting active:", path, location);
  activePath = path;

  // Visual active state for tabs
  openTabs.forEach(tab => {
    tab.tabEl.classList.toggle("active", tab.path === path);
  });

  const activeFile = openTabs.find(t => t.path === path);
  if (!activeFile) return;

  // --- Language detection (filename mapping first, then extension) ---
  const byName = detectLanguageByFilename(activeFile.name);
  const ext = activeFile.name.includes(".")
    ? activeFile.name.split(".").pop().toLowerCase()
    : activeFile.name.toLowerCase();
  let lang = byName || getLanguageFromExt(ext);

  console.log("[Editor] Setting language:", lang, "(name:", activeFile.name, ")");

  // Apply language (fallback to plaintext if Monaco doesn't have it)
  try {
    monaco.editor.setModelLanguage(editor.getModel(), lang);
  } catch (e) {
    console.warn("[Editor] Language not registered in Monaco:", lang, e);
    lang = "plaintext";
    monaco.editor.setModelLanguage(editor.getModel(), lang);
  }

  editor.setValue(activeFile.content);
  setFileStatus(activeFile.path, lang);
  updateCursorStatus();

  // Update outline for this file
  renderOutline(path);

  // --- Preview behavior ---
  // Auto-enable preview for Markdown files; others keep current state.
  const isMd = /\.md(?:|own)?$|\.markdown$/i.test(activeFile.name);

  if (isMd) {
    previewOn = true;                 // force ON for Markdown
    applyPreviewVisibility();          // sync iframe + button UI
    updatePreviewButtonVisibility();   // ensure the toggle is visible/pressed
    renderPreview().catch(() => giveUpPreview("Markdown preview error"));
  } else {
    // Non-Markdown: show/hide button depending on support, keep current state
    updatePreviewButtonVisibility();
    if (previewOn) {
      renderPreview().catch(() => giveUpPreview("Preview error"));
    }
  }

  // Optional targeted jump
  if (location) {
    setTimeout(() => goToLocation(path, location.line, location.pattern), 0);
  }
}

/* ===========================
   Workspace tags loader
   =========================== */
async function loadWorkspaceTags() {
  try {
    const resp = await fetch("__xplore/tags.json");
    if (!resp.ok) throw new Error(`Failed to load tags.json: ${resp.status}`);
    const text = await resp.text();

    // Universal Ctags JSON is typically NDJSON (one JSON object per line)
    const lines = text.split(/\r?\n/).filter(Boolean);

    workspaceTags = [];
    symbolsByFile.clear();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (!obj.name || !obj.path) continue;
        const entry = {
          name: obj.name,
          path: String(obj.path).replace(/\\/g, '/'),
          line: (typeof obj.line === "number") ? obj.line : (obj.line ? Number(obj.line) : null),
          pattern: obj.pattern || null,
          kind: obj.kind || '',
          language: obj.language || '',
          scope: obj.scope || '',
          scopeKind: obj.scopeKind || '',
          signature: obj.signature || obj.sig || null,
          typeref: obj.typeref || null
        };
        workspaceTags.push(entry);
        if (!symbolsByFile.has(entry.path)) symbolsByFile.set(entry.path, []);
        symbolsByFile.get(entry.path).push(entry);
      } catch {
        console.warn("[Tags] Skipping malformed line");
      }
    }
    const msg = `[Tags] Loaded ${workspaceTags.length} symbols across ${symbolsByFile.size} files`;
    console.log(msg);
    toast(msg, 'info');
    statusCenter(msg);
  } catch (e) {
    console.error("[Tags] Error:", e);
    toast("Failed to load tags.json", "error", 3000);
  }
}

/* ===========================
   Icons & utils
   =========================== */
function iconForKind(kind) {
  const k = (kind || "").toLowerCase();
  if (k.startsWith("f") || k === "function" || k === "method") return "codicon-symbol-method";
  if (k.startsWith("c") || k === "class") return "codicon-symbol-class";
  if (k === "struct") return "codicon-symbol-structure";
  if (k === "var" || k === "variable") return "codicon-symbol-variable";
  if (k === "macro") return "codicon-symbol-misc";
  if (k === "enum") return "codicon-symbol-enum";
  return "codicon-symbol-property";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

function basename(p) {
  const s = String(p).replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}
function dirname(p) {
  const s = String(p).replace(/\\/g, '/');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(0, i) : '';
}
function normalizePath(p) {
  const parts = [];
  for (const seg of String(p).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}
function joinContinuedLines(raw) {
  // join lines ending with backslash into logical lines
  const out = [];
  let buf = '';
  for (const line of raw) {
    const l = String(line);
    if (/[\\]\s*$/.test(l)) {
      buf += l.replace(/[\\]\s*$/, ' ');
    } else {
      out.push((buf + l).trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
function unquote(s) {
  const m = String(s).match(/^(['"])(.*)\1$/);
  return m ? m[2] : String(s);
}
function splitMakeArgs(s) {
  // split by spaces while respecting simple quotes
  const re = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
  const parts = [];
  let m;
  while ((m = re.exec(s))) parts.push(m[1] || m[2] || m[3]);
  return parts;
}

// Return best file path in workspace for an include/import/source name
function resolveIncludedTarget(name, currentFilePath) {
  if (!fullTree) return null;
  const files = collectAllFiles(fullTree);
  const allPaths = files.map(f => f.path.replace(/\\/g, '/'));
  const nameNorm = name.replace(/\\/g, '/');

  // 1) Relative from current file's dir if name has a slash or ./../
  if (nameNorm.includes('/') || nameNorm.startsWith('./') || nameNorm.startsWith('../')) {
    const rel = normalizePath(dirname(currentFilePath) + '/' + nameNorm);
    if (allPaths.includes(rel)) return rel;
  }

  // 2) Direct exact match
  if (allPaths.includes(nameNorm)) return nameNorm;

  // 3) Ends-with match
  const bn = '/' + basename(nameNorm);
  const suffixMatches = allPaths.filter(p => p.endsWith(bn));
  if (suffixMatches.length === 1) return suffixMatches[0];

  // 4) Basename match, rank
  const base = basename(nameNorm).toLowerCase();
  const candidates = allPaths.filter(p => basename(p).toLowerCase() === base);

  const preferExt = (exts) => (p) => {
    const e = ('.' + p.split('.').pop().toLowerCase());
    return exts.includes(e) ? 0 : 1;
  };
  const sameDirFirst = (p) => (dirname(p) === dirname(currentFilePath)) ? 0 : 1;
  const preferIncludeDir = (p) => /(^|\/)(include|inc|headers?|src|scripts?)\//i.test(p) ? 0 : 1;

  candidates.sort((a, b) => {
    const ra = sameDirFirst(a) || preferIncludeDir(a) || preferExt(['.h','.hpp','.hh','.hxx','.js','.ts','.jsx','.tsx','.py','.mk','.sh','.c','.cpp','.cc'])(a);
    const rb = sameDirFirst(b) || preferIncludeDir(b) || preferExt(['.h','.hpp','.hh','.hxx','.js','.ts','.jsx','.tsx','.py','.mk','.sh','.c','.cpp','.cc'])(b);
    if (ra !== rb) return ra - rb;
    return a.length - b.length;
  });

  return candidates[0] || (suffixMatches[0] || null);
}

/* ===== include/import/source detection for C/C++, Python, JS/TS, Makefile, Shell ===== */
function parseIncludesFromModel(model, filename) {
  if (!model) return [];
  const text = model.getValue();
  const rawLines = text.split(/\r?\n/);
  const lines = joinContinuedLines(rawLines);
  const results = [];

  const lowerName = (filename || "").toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.split(".").pop() : lowerName;
  const looksMake = lowerName === 'makefile' || /\.mk$/.test(lowerName) || /\.mak$/.test(lowerName);

  // C/C++
  const reC = /^\s*#\s*include\s*([<"])\s*([^>"]+)\s*[>"];/;

  // NOTE: fixed to also match lines without trailing semicolon in includes
  const reCCompat = /^\s*#\s*include\s*([<"])\s*([^>"]+)\s*[>"]/;

  // Python
  const rePyImport = /^\s*import\s+([A-Za-z_][\w\.]*(?:\s*,\s*[A-Za-z_][\w\.]*)*)/;
  const rePyFrom = /^\s*from\s+([A-Za-z_][\w\.]*)\s+import\s+([A-Za-z_\*\w\.,\s]+)/;

  // JS/TS
  const reESImportFrom = /^\s*import\s+.+?\s+from\s+['"]([^'"]+)['"]/;
  const reESImportOnly = /^\s*import\s+['"]([^'"]+)['"]\s*/;
  const reRequire = /(^|[^\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
  const reDynImport = /(^|[^\w])import\s*\(\s*['"]([^'"]+)\s*\)/;

  // Shell
  const reShellSource = /^\s*(?:\.|source)\s+([^\s#;]+)/;

  // Makefile
  const reMkInclude = /^\s*(?:-?include|sinclude)\s+(.+?)\s*$/;
  const reMkAssign = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\+?=)\s*(.+?)\s*$/;

  // gather simple Makefile vars
  const mkVars = {};
  if (looksMake) {
    for (const l of lines) {
      const m = reMkAssign.exec(l);
      if (m) {
        const key = m[1];
        const val = m[2];
        mkVars[key] = (mkVars[key] ? mkVars[key] + ' ' : '') + val;
      }
    }
  }
  const expandMakeVars = (s) => {
    return String(s)
      .replace(/\$\(([^)]+)\)/g, (_, v) => mkVars[v] || '')
      .replace(/\$\{([^}]+)\}/g, (_, v) => mkVars[v] || '');
  };
  const expandShellPath = (s) => {
    let v = unquote(s);
    v = v.replace(/^~\//, '');            // drop ~
    v = v.replace(/\$[A-Za-z_]\w*/g, ''); // strip env vars (best-effort)
    return v;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // C/C++ (support with or without trailing semicolon)
    let mC = reC.exec(line) || reCCompat.exec(line);
    if (mC && /\b(c|h)(pp|xx)?$/.test(ext)) {
      results.push({ lang: "c/cpp", name: mC[2], line: i + 1, kind: "include" });
      continue;
    }

    // Python
    if (ext === "py" || ext === "pyw") {
      let m = rePyImport.exec(line);
      if (m) {
        const mods = m[1].split(",").map(s => s.trim()).filter(Boolean);
        for (const mod of mods) results.push({ lang: "python", name: mod, line: i + 1, kind: "import" });
        continue;
      }
      m = rePyFrom.exec(line);
      if (m) {
        const base = m[1];
        const names = m[2].split(",").map(s => s.trim()).filter(Boolean);
        for (const nm of names) {
          results.push({ lang: "python", name: `${base} → ${nm}`, line: i + 1, kind: "from-import" });
        }
        continue;
      }
    }

    // JS / TS / JSX / TSX / MJS / CJS
    if (["js","ts","jsx","tsx","mjs","cjs"].includes(ext)) {
      let m = reESImportFrom.exec(line);
      if (m) { results.push({ lang: "js/ts", name: m[1], line: i + 1, kind: "import-from" }); continue; }
      m = reESImportOnly.exec(line);
      if (m) { results.push({ lang: "js/ts", name: m[1], line: i + 1, kind: "import" }); continue; }
      m = reRequire.exec(line);
      if (m) { results.push({ lang: "js/ts", name: m[2], line: i + 1, kind: "require" }); continue; }
      m = reDynImport.exec(line);
      if (m) { results.push({ lang: "js/ts", name: m[2], line: i + 1, kind: "dynamic-import" }); continue; }
    }

    // Shell: . file / source file
    if (["sh","bash","zsh","ksh"].includes(ext) || /(^|\.)bash(rc|_profile)?$/.test(lowerName)) {
      const m = reShellSource.exec(line);
      if (m) {
        const raw = m[1];
        const expanded = expandShellPath(raw);
        if (expanded) results.push({ lang: "shell", name: expanded, line: i + 1, kind: "source" });
        continue;
      }
    }

    // Makefile: include / -include / sinclude
    if (looksMake) {
      const mInc = reMkInclude.exec(line);
      if (mInc) {
        const expanded = expandMakeVars(mInc[1]);
        const args = splitMakeArgs(expanded);
        for (const a of args) {
          if (!a || /[%*?]/.test(a)) continue; // skip wildcards
          results.push({ lang: "make", name: unquote(a), line: i + 1, kind: "include" });
        }
        continue;
      }

      // Common var lists SRCS/OBJS/HDRS/etc.
      const mVar = reMkAssign.exec(line);
      if (mVar) {
        const key = mVar[1].toUpperCase();
        const val = expandMakeVars(mVar[2]);
        const items = splitMakeArgs(val).map(unquote);
        if (/^(SRC|SRCS|SOURCES|HDRS|HEADERS|OBJS|OBJECTS)$/.test(key)) {
          for (const it of items) {
            if (!it || /[%*?]/.test(it)) continue;
            results.push({ lang: "make", name: it, line: i + 1, kind: key.toLowerCase() });
          }
        }
      }
    }
  }

  return results;
}

/* ===========================
   Outline (right panel) — GROUPED
   =========================== */
function renderOutline(path) {
  const list = document.getElementById("outline-list");
  list.innerHTML = "";

  if (!path) {
    statusCenter("Outline: No file");
    return;
  }

  const fileSyms = symbolsByFile.get(path) || [];

  // Gather includes/imports from the actual editor text
  const model = editor.getModel();
  const currentTab = openTabs.find(t => t.path === path);
  const includes = (activePath === path) ? parseIncludesFromModel(model, currentTab ? currentTab.name : "") : [];

  // Buckets
  const macros = [];
  const globals = [];
  const classes = [];
  const functions = [];

  for (const s of fileSyms) {
    const kind = (s.kind || "").toLowerCase();
    if (kind === "macro" || kind === "define" || kind === "preproc") { macros.push(s); continue; }
    if (kind === "function" || kind === "method") { functions.push(s); continue; }
    if (kind === "class" || kind === "struct" || kind === "union" || kind === "enum" || kind === "typedef" || kind === "interface") { classes.push(s); continue; }
    if (kind === "variable" || kind === "var") {
      const sk = (s.scopeKind || "").toLowerCase();
      if (!sk || (sk && sk !== "function" && sk !== "method")) { globals.push(s); continue; }
    }
  }

  // Filter (applies to all sections)
  const filter = document.getElementById("outline-filter").value.trim().toLowerCase();
  const filterText = (txt) => String(txt || "").toLowerCase().includes(filter);
  function maybeFilter(list, key = 'name') {
    if (!filter) return list;
    return list.filter(s => filterText(s[key]));
  }
  const includesFiltered = !filter ? includes
    : includes.filter(inc => filterText(inc.name) || filterText(inc.kind) || filterText(inc.lang));

  const sections = [
    {
      title: "File Included",
      icon: "codicon-symbol-file",
      items: includesFiltered.map(inc => ({
        _type: "include",
        name: inc.name,
        line: inc.line,
        lang: inc.lang,
        kind: inc.kind
      }))
    },
    { title: "Macros", icon: "codicon-symbol-misc", items: maybeFilter(macros) },
    { title: "Global variables", icon: "codicon-symbol-variable", items: maybeFilter(globals) },
    { title: "Classes", icon: "codicon-symbol-class", items: maybeFilter(classes) },
    { title: "Functions", icon: "codicon-symbol-method", items: maybeFilter(functions) }
  ];

  let totalShown = 0;

  for (const sec of sections) {
    const header = document.createElement("li");
    header.className = "outline-section";
    header.innerHTML = `<span class="codicon ${sec.icon}"></span><span class="section-title">${sec.title}</span>`;
    list.appendChild(header);

    if (!sec.items || sec.items.length === 0) continue;

    for (const sym of sec.items) {
      totalShown++;
      const li = document.createElement("li");
      li.className = `outline-item`;

      if (sym._type === "include") {
        const icon = (sym.lang === "python") ? "codicon-symbol-namespace"
                   : (sym.lang === "js/ts") ? "codicon-symbol-module"
                   : (sym.lang === "shell") ? "codicon-terminal"
                   : (sym.lang === "make") ? "codicon-gear"
                   : "codicon-symbol-file";
        const label = sym.name + (sym.kind ? `  (${sym.kind})` : "");
        li.innerHTML = `<span class="codicon ${icon}"></span>
                        <span class="label">${escapeHtml(label)}</span>`;
        li.title = `${sym.lang || 'include'} • ${sym.kind || ''}`;
        li.addEventListener("click", async () => {
          const target = resolveIncludedTarget(sym.name, path);
          if (target) {
            await navigateTo(target, null, null, { record: true });
            toast(`Opened ${sym.name}`, 'info');
            statusCenter(`Opened included/imported: ${sym.name}`);
            return;
          }
          if (activePath !== path) {
            await navigateTo(path, sym.line, null, { record: true });
          } else {
            goToLocation(path, sym.line, null);
          }
          toast(`No target found. Jumped to include/import`, 'warn');
          statusCenter(`Jumped to include/import line for ${sym.name}`);
        });
      } else {
        li.innerHTML = `<span class="codicon ${iconForKind(sym.kind)}"></span>
                        <span class="label">${escapeHtml(sym.name)}</span>`;
        li.title = `${sym.kind || 'symbol'}${sym.scope ? ' — ' + sym.scope : ''}`;
        li.addEventListener("click", async () => {
          statusCenter(`Outline jump: ${sym.name}`);
          if (activePath !== path) await navigateTo(path, sym.line || null, sym.pattern, { record: true });
          else goToLocation(path, sym.line || null, sym.pattern);
        });
      }
      list.appendChild(li);
    }
  }

  statusCenter(`Outline updated (${totalShown} symbols${includes.length ? `, ${includes.length} includes/imports` : ''})`);
}

document.getElementById("outline-filter").addEventListener("input", () => {
  renderOutline(activePath);
  statusCenter(`Outline filter: "${document.getElementById("outline-filter").value.trim()}"`);
});

/* ===========================
   Jump-to-definition (generic)
   =========================== */
function goToLocation(path, line = null, pattern = null) {
  const tab = openTabs.find(t => t.path === path);
  if (!tab) return;

  if (typeof line === "number" && line > 0) {
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    toast(`Jumped to ${shortenPath(path)}:${line}`, "info");
    updateCursorStatus();
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
        toast(`Jumped to ${shortenPath(path)}:${lineNum}`, "info");
        updateCursorStatus();
        return;
      }
    } catch {
      console.warn("[Jump] Invalid regex from pattern");
    }
  }

  toast("Definition location not found", "warn");
}

/* ===========================
   Symbol palette (modal)
   =========================== */
const modalEl = document.getElementById("symbol-modal");
const resultsEl = document.getElementById("symbol-results");
const queryEl = document.getElementById("symbol-query");

function openSymbolModal(tab) {
  modalEl.setAttribute("aria-hidden", "false");
  modalEl.style.display = "flex";
  setActiveSymbolTab(tab);
  queryEl.value = "";
  resultsEl.innerHTML = "";
  queryEl.focus();
  statusCenter(`Symbols: ${tab}`);
}
function closeSymbolModal() {
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.style.display = "none";
  statusCenter("Symbols: closed");
}
function setActiveSymbolTab(which) {
  const tabs = modalEl.querySelectorAll(".modal-tabs button");
  tabs.forEach(b => b.classList.remove("active"));
  const btn = Array.from(tabs).find(b => b.dataset.tab === which);
  if (btn) btn.classList.add("active");
  queryEl.dataset.scope = which;
  updateSymbolResults();
}
modalEl?.querySelectorAll(".modal-tabs button").forEach(btn => {
  btn.addEventListener("click", () => { setActiveSymbolTab(btn.dataset.tab); statusCenter(`Symbols tab: ${btn.dataset.tab}`); });
});
queryEl?.addEventListener("input", () => { updateSymbolResults(); statusCenter(`Symbol query: "${queryEl.value.trim()}"`); });
resultsEl?.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-path]");
  if (!li) return;
  const path = li.getAttribute("data-path");
  const line = li.getAttribute("data-line");
  const pattern = li.getAttribute("data-pattern");
  closeSymbolModal();
  await navigateTo(path, line ? Number(line) : null, pattern || null, { record: true });
});

function updateSymbolResults() {
  const scope = queryEl.dataset.scope || "workspace";
  const q = queryEl.value.trim();
  let list = [];
  if (scope === "file" && activePath && symbolsByFile.has(activePath)) {
    list = symbolsByFile.get(activePath);
  } else {
    list = workspaceTags;
  }
  const matches = fuzzyFilter(list, q, 200);
  renderSymbolResults(matches);
  statusCenter(`Symbols: ${matches.length} matches`);
}
function renderSymbolResults(items) {
  resultsEl.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No results";
    resultsEl.appendChild(empty);
    return;
  }
  for (const s of items) {
    const li = document.createElement("li");
    li.setAttribute("data-path", s.path);
    if (s.line) li.setAttribute("data-line", String(s.line));
    if (s.pattern) li.setAttribute("data-pattern", s.pattern);
    li.innerHTML = `
      <span class="codicon ${iconForKind(s.kind)}"></span>
      <span class="name">${escapeHtml(s.name)}</span>
      <span class="dim">${escapeHtml(shortenPath(s.path))}${s.line ? ':' + s.line : ''}</span>`;
    resultsEl.appendChild(li);
  }
}
function shortenPath(p) {
  const parts = String(p).split("/");
  if (parts.length <= 3) return p;
  return `${parts.slice(0, 1)}/…/${parts.slice(-2).join("/")}`;
}
// Lightweight fuzzy filter by symbol name
function fuzzyFilter(list, q, limit = 100) {
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

/* ===========================
   Right-click (context menu) actions
   =========================== */
function addContextMenuActions() {
  editor.addAction({
    id: "ctx-goto-definition",
    label: "Go to Definition",
    keybindings: [monaco.KeyCode.F12],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    run: async () => { statusCenter("Go to Definition"); await gotoDefinitionAtCursor(); }
  });

  editor.addAction({
    id: "ctx-goto-type-definition",
    label: "Go to Type Definition",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.6,
    run: async () => { statusCenter("Go to Type Definition"); await gotoTypeDefinitionAtCursor(); }
  });

  editor.addAction({
    id: "ctx-goto-implementations",
    label: "Go to Implementations",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.7,
    run: async () => { statusCenter("Go to Implementations"); await gotoImplementationsAtCursor(); }
  });

  editor.addAction({
    id: "ctx-goto-source-definition",
    label: "Go to Source Definition",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.8,
    run: async () => { statusCenter("Go to Source Definition"); await gotoSourceDefinitionAtCursor(); }
  });

  // Updated behaviors
  editor.addAction({
    id: "ctx-goto-references",
    label: "Go to References",
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.9,
    run: async () => { statusCenter("Go to References (file)"); await findReferencesInFileAtCursor(); }
  });

  editor.addAction({
    id: "ctx-find-all-references",
    label: "Find All References",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 2.0,
    run: async () => { statusCenter("Find All References (workspace)"); await findAllReferencesAtCursor(); }
  });
}

// Helpers to get symbol under cursor
function getWordUnderCursor() {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return null;
  const w = model.getWordAtPosition(pos);
  return w ? w.word : null;
}

async function gotoDefinitionAtCursor() {
  const symbol = getWordUnderCursor();
  if (!symbol) return;
  let candidates = [];
  if (activePath && symbolsByFile.has(activePath)) {
    candidates = symbolsByFile.get(activePath).filter(s => s.name === symbol);
  }
  if (candidates.length === 0) {
    candidates = workspaceTags.filter(s => s.name === symbol);
  }

  if (candidates.length === 1) {
    const s = candidates[0];
    if (activePath !== s.path) await navigateTo(s.path, s.line || null, s.pattern || null, { record: true });
    else goToLocation(s.path, s.line || null, s.pattern || null);
    return;
  }

  if (candidates.length > 1) {
    candidates.sort((a, b) => rankBySourcePref(a.path) - rankBySourcePref(b.path));
    openSymbolModal('workspace');
    renderSymbolResults(candidates.slice(0, 200));
    toast(`${candidates.length} definitions found`, "info");
    return;
  }

  await editor.getAction("editor.action.revealDefinition").run();
  toast("Tried Monaco definition (no tag match)", "warn");
}

/* ===========================
   Go to Type Definition
   =========================== */
async function gotoTypeDefinitionAtCursor() {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return;
  const symbol = getWordUnderCursor();
  if (!symbol) return;

  const localSyms = (symbolsByFile.get(activePath) || []).filter(s => s.name === symbol);
  const wsSyms = workspaceTags.filter(s => s.name === symbol);
  const allSyms = [...localSyms, ...wsSyms];

  let typeName = null;
  for (const s of allSyms) {
    if (s.typeref) {
      const parts = String(s.typeref).split(":");
      typeName = parts.length > 1 ? parts.slice(1).join(":") : s.typeref;
      break;
    }
  }
  if (!typeName) {
    const lineText = model.getLineContent(pos.lineNumber);
    typeName = inferTypeFromLine(lineText, symbol);
  }
  if (!typeName) {
    toast("Type could not be inferred", "warn");
    return;
  }

  const typeKinds = new Set(["class", "struct", "union", "enum", "typedef", "interface"]);
  const candidates = workspaceTags
    .filter(s => s.name === typeName && (typeKinds.has((s.kind || "").toLowerCase())));
  if (candidates.length === 0) {
    toast(`Type not found: ${typeName}`, "warn");
    return;
  }
  candidates.sort((a, b) => rankBySourcePref(a.path) - rankBySourcePref(b.path));
  const s = candidates[0];
  if (activePath !== s.path) await navigateTo(s.path, s.line || null, s.pattern || null, { record: true });
  else goToLocation(s.path, s.line || null, s.pattern || null);
}

// crude C-like type inference
function inferTypeFromLine(line, symbol) {
  const idx = line.indexOf(symbol);
  if (idx <= 0) return null;
  const left = line.slice(0, idx);
  let s = left.replace(/\s+/g, " ").trim();
  s = s.split("=").shift().trim();
  s = s.replace(/\s*[*&]+\s*$/, "").trim();
  const mKW = s.match(/\b(struct|class|enum|union)\s+([A-Za-z_][\w:]*)\s*$/);
  if (mKW) return mKW[2];
  const mID = s.match(/([A-Za-z_][\w:<>]*?)\s*$/);
  if (mID) return mID[1].replace(/<.*>$/,"");
  return null;
}

/* ===========================
   Go to Source Definition (prefer implementation files)
   =========================== */
async function gotoSourceDefinitionAtCursor() {
  const symbol = getWordUnderCursor();
  if (!symbol) return;
  let candidates = workspaceTags.filter(s => s.name === symbol);

  if (candidates.length === 0) {
    toast("No source candidates", "warn");
    return;
  }

  candidates.sort((a, b) => rankBySourcePref(a.path) - rankBySourcePref(b.path));

  if (candidates.length > 1) {
    openSymbolModal('workspace');
    renderSymbolResults(candidates.slice(0, 200));
    toast(`${candidates.length} source candidates`, "info");
    return;
  }
  const s = candidates[0];
  if (activePath !== s.path) await navigateTo(s.path, s.line || null, s.pattern || null, { record: true });
  else goToLocation(s.path, s.line || null, s.pattern || null);
}

function rankBySourcePref(p) {
  const header = ['.h', '.hpp', '.hh', '.hxx'];
  const source = ['.c', '.cc', '.cpp', '.cxx', '.m', '.mm', '.java', '.go', '.rs'];
  const ext = '.' + p.split('.').pop().toLowerCase();
  if (source.includes(ext)) return 0;
  if (header.includes(ext)) return 2;
  return 1;
}

/* ===========================
   Go to Implementations (best-effort)
   =========================== */
async function gotoImplementationsAtCursor() {
  const symbol = getWordUnderCursor();
  if (!symbol) return;
  const funcKinds = new Set(["function", "method"]);
  let impls = workspaceTags.filter(s =>
    s.name === symbol &&
    (funcKinds.has((s.kind || "").toLowerCase()) || isLikelyFunctionSignature(s))
  );
  if (impls.length === 0) {
    toast("No implementations found", "warn");
    return;
  }
  impls.sort((a, b) => rankBySourcePref(a.path) - rankBySourcePref(b.path));

  if (impls.length === 1) {
    const s = impls[0];
    if (activePath !== s.path) await navigateTo(s.path, s.line || null, s.pattern || null, { record: true });
    else goToLocation(s.path, s.line || null, s.pattern || null);
    return;
  }
  openSymbolModal('workspace');
  renderSymbolResults(impls.slice(0, 200));
  toast(`${impls.length} implementations`, "info");
}

function isLikelyFunctionSignature(tag) {
  if (tag.signature) return true;
  if (tag.pattern && /\(.*\)/.test(tag.pattern)) return true;
  return false;
}

/* ===========================
   References (file-only & workspace)
   =========================== */
const refsModal = document.getElementById("refs-modal");
const refsResults = document.getElementById("refs-results");
const refsClose = document.getElementById("refs-close");
function closeRefsModal() {
  refsModal.setAttribute("aria-hidden", "true");
  refsModal.style.display = "none";
  statusCenter("References: closed");
}
function openRefsModal(title) {
  document.getElementById("refs-title").textContent = title || "References";
  refsResults.innerHTML = "";
  refsModal.setAttribute("aria-hidden", "false");
  refsModal.style.display = "flex";
  statusCenter(title || "References");
}
if (refsClose) refsClose.addEventListener("click", closeRefsModal);

// Go to References — FILE ONLY
async function findReferencesInFileAtCursor() {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return;
  const symbol = getWordUnderCursor();
  if (!symbol) return;

  const text = model.getValue();
  const path = activePath || "(unsaved)";
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
  const list = document.getElementById("refs-results");
  list.innerHTML = "";
  if (results.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No references found in this file.";
    list.appendChild(li);
    toast("No references in this file", "warn");
    return;
  }

  for (const r of results) {
    const li = document.createElement("li");
    li.setAttribute("data-path", r.path);
    li.setAttribute("data-line", String(r.line));
    li.innerHTML = `
      <span class="codicon codicon-references"></span>
      <span class="name">${escapeHtml(shortenPath(r.path))}:${r.line}</span>
      <span class="dim">${escapeHtml(r.snippet)}</span>`;
    li.addEventListener("click", async () => {
      closeRefsModal();
      await navigateTo(r.path, r.line, null, { record: true });
    });
    list.appendChild(li);
  }

  toast(`${results.length} references in file`, "info");
}

// Find All References — WORKSPACE
async function findAllReferencesAtCursor() {
  const model = editor.getModel();
  const pos = editor.getPosition();
  if (!model || !pos) return;
  const symbol = getWordUnderCursor();
  if (!symbol) return;

  openRefsModal(`References: ${symbol}`);

  const files = collectAllFiles(fullTree)
    .filter(f => isSearchableFile(f.name, f.mimetype))
    .slice(0, 200); // safety cap

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
    } catch {
      return [];
    }
  }), 10);

  const found = tasks.flat().slice(0, 500);
  if (found.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No references found.";
    refsResults.appendChild(li);
    toast("No references found", "warn");
    return;
  }

  for (const r of found) {
    const li = document.createElement("li");
    li.setAttribute("data-path", r.path);
    li.setAttribute("data-line", String(r.line));
    li.innerHTML = `
      <span class="codicon codicon-references"></span>
      <span class="name">${escapeHtml(shortenPath(r.path))}:${r.line}</span>
      <span class="dim">${escapeHtml(r.snippet)}</span>`;
    li.addEventListener("click", async () => {
      closeRefsModal();
      await navigateTo(r.path, r.line, null, { record: true });
    });
    refsResults.appendChild(li);
  }
  toast(`${found.length} references in workspace`, "info");
}

function collectAllFiles(nodes, acc = []) {
  for (const n of nodes) {
    if (n.type === "file") acc.push(n);
    if (n.children) collectAllFiles(n.children, acc);
  }
  return acc;
}
function isSearchableFile(name, mimetype) {
  const ext = name.split(".").pop().toLowerCase();
  const codey = ["c","h","cpp","hpp","hh","hxx","cc","py","js","ts","java","go","rs","rb","php","sh","mk","mak","rc","vim","lua","json","yaml","yml","toml","md","txt","html","css","cfg","in","jsx","tsx","mjs","cjs","bash","zsh","ksh","makefile","make"];
  if (name.toLowerCase() === "makefile") return true;
  return codey.includes(ext) || (mimetype && mimetype.startsWith("text/"));
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// IMPORTANT: async op runner
async function limitConcurrency(jobs, limit = 8) {
  const queue = [...jobs];
  const running = [];
  const results = [];
  while (queue.length || running.length) {
    while (running.length < limit && queue.length) {
      const job = queue.shift();
      const p = job().then(r => results.push(r)).finally(() => {
        const i = running.indexOf(p);
        if (i >= 0) running.splice(i, 1);
      });
      running.push(p);
    }
    const tick = Promise.race(running.length ? running : [Promise.resolve()]);
    await tick;
  }
  return results;
}
