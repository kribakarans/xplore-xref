// outline.js — grouped outline + include/import detection
import { symbolsByFile } from "./tags.js";
import { escapeHtml, joinContinuedLines, unquote, splitMakeArgs, basename, dirname, normalizePath } from "./utils.js";
import { statusCenter, toast } from "./status.js";
import { navigateTo } from "./nav.js";
import { getEditor, getActivePath, getActiveTab, blinkLine } from "./editor.js";

export function renderOutline(path) {
  const list = document.getElementById("outline-list");
  list.innerHTML = "";
  if (!path) { statusCenter("Outline: No file"); return; }
  const fileSyms = symbolsByFile.get(path) || [];
  const model = getEditor().getModel();
  const currentTab = getActiveTab();
  const includes = (getActivePath() === path) ? parseIncludesFromModel(model, currentTab ? currentTab.name : "") : [];

  const macros = [], globals = [], classes = [], functions = [];
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

  const filter = document.getElementById("outline-filter").value.trim().toLowerCase();
  const filterText = (txt) => String(txt || "").toLowerCase().includes(filter);
  function maybeFilter(list, key = 'name') { if (!filter) return list; return list.filter(s => filterText(s[key])); }
  const includesFiltered = !filter ? includes : includes.filter(inc => filterText(inc.name) || filterText(inc.kind) || filterText(inc.lang));

  const sections = [
    { title: "File Included", icon: "codicon-symbol-file", items: includesFiltered.map(inc => ({ _type:"include", name:inc.name, line:inc.line, lang:inc.lang, kind:inc.kind })) },
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
      const li = document.createElement("li"); li.className = "outline-item";
      if (sym._type === "include") {
        const icon = (sym.lang === "python") ? "codicon-symbol-namespace"
                   : (sym.lang === "js/ts") ? "codicon-symbol-module"
                   : (sym.lang === "shell") ? "codicon-terminal"
                   : (sym.lang === "make") ? "codicon-gear"
                   : "codicon-symbol-file";
        const label = sym.name + (sym.kind ? `  (${sym.kind})` : "");
        li.innerHTML = `<span class="codicon ${icon}"></span><span class="label">${escapeHtml(label)}</span>`;
        li.title = `${sym.lang || 'include'} • ${sym.kind || ''}`;
        li.addEventListener("click", async () => {
          const target = resolveIncludedTarget(sym.name, path);
          if (target) {
            await navigateTo(target, null, null, { record: true });
            toast(`Opened ${sym.name}`, 'info');
            statusCenter(`Opened included/imported: ${sym.name}`);
            return;
          }
          if (getActivePath() !== path) {
            await navigateTo(path, sym.line, null, { record: true });
          } else {
            const ed = getEditor();
            if (ed && sym.line) {
              ed.revealLineInCenter(sym.line);
              ed.setPosition({ lineNumber: sym.line, column: 1 });
              ed.focus();
              blinkLine(sym.line); // highlight same-file jump
            }
          }
          toast(`No target found. Jumped to include/import`, 'warn');
          statusCenter(`Jumped to include/import line for ${sym.name}`);
        });
      } else {
        li.innerHTML = `<span class="codicon codicon-symbol-property"></span><span class="label">${escapeHtml(sym.name)}</span>`;
        li.title = `${sym.kind || 'symbol'}${sym.scope ? ' — ' + sym.scope : ''}`;
        li.addEventListener("click", async () => {
          statusCenter(`Outline jump: ${sym.name}`);
          await navigateTo(path, sym.line || null, sym.pattern || null, { record: true });
        });
      }
      list.appendChild(li);
    }
  }
  statusCenter(`Outline updated (${totalShown} symbols${includes.length ? `, ${includes.length} includes/imports` : ''})`);
}

export function resolveIncludedTarget(name, currentFilePath) {
  const all = Array.from(document.querySelectorAll("#file-tree li.file")).map(li => li.dataset?.path).filter(Boolean);
  const nameNorm = name.replace(/\\/g, '/');
  const bn = '/' + basename(nameNorm);
  const suffixMatches = all.filter(p => p.endsWith(bn));
  return suffixMatches[0] || null;
}

// Lightweight parser replicated from monolith
export function parseIncludesFromModel(model, filename) {
  if (!model) return [];
  const text = model.getValue();
  const rawLines = text.split(/\r?\n/);
  const lines = joinContinuedLines(rawLines);
  const results = [];

  const lowerName = (filename || "").toLowerCase();
  const ext = lowerName.includes('.') ? lowerName.split(".").pop() : lowerName;
  const looksMake = lowerName === 'makefile' || /\.mk$/.test(lowerName) || /\.mak$/.test(lowerName);

  const reCCompat = /^\s*#\s*include\s*([<"])\s*([^>"]+)\s*[>"]/;
  const rePyImport = /^\s*import\s+([A-Za-z_][\w\.]*(?:\s*,\s*[A-Za-z_][\w\.]*)*)/;
  const rePyFrom = /^\s*from\s+([A-Za-z_][\w\.]*)\s+import\s+([A-Za-z_\*\w\.,\s]+)/;
  const reESImportFrom = /^\s*import\s+.+?\s+from\s+['"]([^'"]+)['"]/;
  const reESImportOnly = /^\s*import\s+['"]([^'"]+)['"]\s*/;
  const reRequire = /(^|[^\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
  const reDynImport = /(^|[^\w])import\s*\(\s*['"]([^'"]+)\s*\)/;
  const reShellSource = /^\s*(?:\.|source)\s+([^\s#;]+)/;
  const reMkInclude = /^\s*(?:-?include|sinclude)\s+(.+?)\s*$/;
  const reMkAssign = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\+?=)\s*(.+?)\s*$/;

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
  const expandMakeVars = (s) => String(s).replace(/\$\(([^)]+)\)/g, (_, v) => mkVars[v] || '').replace(/\$\{([^}]+)\}/g, (_, v) => mkVars[v] || '');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(c|h)(pp|xx)?$/.test(ext)) {
      const m = reCCompat.exec(line);
      if (m) { results.push({ lang: "c/cpp", name: m[2], line: i + 1, kind: "include" }); continue; }
    }
    if (ext === "py" || ext === "pyw") {
      let m = rePyImport.exec(line);
      if (m) { for (const mod of m[1].split(",").map(s=>s.trim()).filter(Boolean)) results.push({ lang: "python", name: mod, line: i + 1, kind: "import" }); continue; }
      m = rePyFrom.exec(line);
      if (m) { const base = m[1]; for (const nm of m[2].split(",").map(s=>s.trim()).filter(Boolean)) results.push({ lang: "python", name: `${base} → ${nm}`, line: i + 1, kind: "from-import" }); continue; }
    }
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
    if (["sh","bash","zsh","ksh"].includes(ext) || /(^|\.)bash(rc|_profile)?$/.test(lowerName)) {
      const m = reShellSource.exec(line);
      if (m) { results.push({ lang: "shell", name: m[1], line: i + 1, kind: "source" }); continue; }
    }
    if (looksMake) {
      const mInc = reMkInclude.exec(line);
      if (mInc) {
        const expanded = expandMakeVars(mInc[1]);
        const args = splitMakeArgs(expanded);
        for (const a of args) { if (!a || /[%*?]/.test(a)) continue; results.push({ lang: "make", name: a, line: i + 1, kind: "include" }); }
        continue;
      }
    }
  }
  return results;
}

// Helper to jump to line within current editor (used when include can't resolve)
function goToLocation(path, line) {
  const ed = getEditor();
  if (!ed) return;
  if (typeof line === "number" && line > 0) {
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
    blinkLine(line);
  }
}
