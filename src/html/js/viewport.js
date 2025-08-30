// viewport.js — bootstrap for viewport.html
// Provides single-file view: editor + preview + outline + toolbar (no sidebar tree).

import { createMonacoEditor, blinkLine, openTab, setActiveTab } from "./editor.js";
import { loadFile } from "./fs.js";
import { detectLanguageByFilename, getLanguageFromExt } from "./lang.js";
import { statusCenter, toast } from "./status.js";
import { applyPreviewVisibility, renderPreview, setPreviewOn, updatePreviewButtonVisibility, getPreviewOn } from "./preview.js";
import { renderOutline } from "./outline.js";
import { openSymbolModal } from "./symbols.js";
import { closeAllModals } from "./modal.js";
import { goBack, goForward, updateNavButtons } from "./nav.js";
import { workspaceTags, symbolsByFile } from "./tags.js";   // use globals

// ✅ Loader for JSONL-style tags.json (ctags output)
async function loadTagsForViewport() {
  try {
    const resp = await fetch("__xplore/tags.json");
    if (!resp.ok) throw new Error(`Failed to fetch tags.json: ${resp.status}`);
    const text = await resp.text();

    const lines = text.split(/\r?\n/).filter(Boolean);
    workspaceTags.length = 0;
    symbolsByFile.clear();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        workspaceTags.push(obj);
        if (obj.path) {
          if (!symbolsByFile.has(obj.path)) symbolsByFile.set(obj.path, []);
          symbolsByFile.get(obj.path).push(obj);
        }
      } catch (e) {
        console.warn("Skipping malformed tag line:", line);
      }
    }

    console.log(`INFO | tags.json loaded for viewport: ${workspaceTags.length} symbols`);
  } catch (err) {
    console.error("ERROR | loadTagsForViewport failed:", err);
    statusCenter("Failed to load symbols");
  }
}

// Get query parameters
function getQueryParam(key) {
  return new URLSearchParams(location.search).get(key);
}

window.addEventListener("load", async () => {
  const ed = await createMonacoEditor();

  const path = getQueryParam("path");
  const line = Number(getQueryParam("line") || 0);

  if (!path) {
    statusCenter("No file specified in URL");
    return;
  }

  try {
    // ✅ Stage 1: load tags.json before outline render
    await loadTagsForViewport();

    // Stage 2: load file content
    const file = await loadFile(path);
    let lang = detectLanguageByFilename(file.name);
    if (!lang) {
      const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
      lang = getLanguageFromExt(ext);
    }

    // Open tab + set language
    openTab(file);
    setActiveTab(file.path);
    monaco.editor.setModelLanguage(ed.getModel(), lang);

    // ✅ Stage 3: render outline with workspace + file symbols
    renderOutline(file.path);

    if (line > 0) {
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      blinkLine(line);
    }

    statusCenter(`Opened ${file.name}`);
  } catch (e) {
    console.error("Viewport load failed:", e);
    statusCenter("Error loading file: " + e.message);
  }

  /* ───────── Toolbar wiring ───────── */
  document.getElementById("editor-minimap")?.addEventListener("click", () => {
    const current = ed.getOption(monaco.editor.EditorOption.minimap).enabled;
    ed.updateOptions({ minimap: { enabled: !current } });
    toast(`Minimap ${!current ? "ON" : "OFF"}`);
  });

  document.getElementById("editor-wrap")?.addEventListener("click", () => {
    const current = ed.getOption(monaco.editor.EditorOption.wordWrap);
    const next = current === "on" ? "off" : "on";
    ed.updateOptions({ wordWrap: next });
    toast(`Word Wrap ${next === "on" ? "ON" : "OFF"}`);
  });

  document.getElementById("editor-search")?.addEventListener("click", () => {
    ed.getAction("actions.find").run();
    toast("Find in File");
  });

  document.getElementById("editor-preview")?.addEventListener("click", () => {
    const on = !getPreviewOn();
    setPreviewOn(on);
    applyPreviewVisibility();
    if (on) renderPreview().catch(() => {});
    toast(`Preview ${on ? "ON" : "OFF"}`);
  });

  // Save handler
  function saveActiveTab() {
    const model = ed.getModel();
    if (!model) { toast("Nothing to save"); return; }
    const blob = new Blob([model.getValue() ?? ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = path.split("/").pop() || "download.txt";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
    a.remove();
    toast(`Saved ${path}`);
  }
  document.getElementById("editor-save")?.addEventListener("click", saveActiveTab);
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveActiveTab();
    }
  });

  // File symbols
  document.getElementById("file-symbols")?.addEventListener("click", () => {
    openSymbolModal("file");
    toast("File Symbols");
  });

  // Outline toggle
  document.getElementById("toggle-outline")?.addEventListener("click", () => {
    document.body.classList.toggle("outline-hidden");
    const hidden = document.body.classList.contains("outline-hidden");
    document.getElementById("toggle-outline")?.setAttribute("aria-pressed", String(!hidden));
    toast(`Outline ${hidden ? "hidden" : "shown"}`);
  });

  /* ───────── Hotkeys ───────── */
  window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openSymbolModal("file");
      toast("File Symbols (Ctrl+Shift+O)");
    } else if (e.key === "Escape") {
      closeAllModals();
      statusCenter("Dismissed modals");
    } else if (e.altKey && !ctrl && !e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
    } else if (e.altKey && !ctrl && !e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward();
    }
  });

  updateNavButtons();
  applyPreviewVisibility();
  updatePreviewButtonVisibility();
});
