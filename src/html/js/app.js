// app-boot.js — entrypoint
import { createMonacoEditor, getEditor, setFullTree } from "./editor.js";
import { renderTree, searchTree } from "./tree.js";
import { loadFullTree } from "./fs.js";
import { loadWorkspaceTags } from "./tags.js";
import { toast, statusCenter } from "./status.js";
import { navigateTo, goBack, goForward, updateNavButtons } from "./nav.js";
import { openSymbolModal } from "./symbols.js";
import { applyPreviewVisibility, updatePreviewButtonVisibility, renderPreview, setPreviewOn, getPreviewOn } from "./preview.js";
import { closeAllModals } from "./modal.js";
import { openGrepModal } from "./grep.js";

function findReadme(tree) {
  const readmeNames = ["README.md", "INDEX.md"];
  function search(nodes) {
    for (const node of nodes) {
      if (node.type === "file" && readmeNames.includes(node.name)) return node;
      if (node.children) {
        const found = search(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(tree);
}

createMonacoEditor();

// Wait a tick for Monaco to be ready before wiring everything else
window.addEventListener("load", async () => {
  const ed = getEditor();
  statusCenter("Loading tree…");
  const fullTree = await loadFullTree();
  setFullTree(fullTree);
  renderTree(fullTree, document.getElementById("file-tree"));
  toast("Tree loaded");

  await loadWorkspaceTags();

  const readme = findReadme(fullTree);
  if (readme) await navigateTo(readme.path, null, null, { record: false });

  const searchToggle = document.getElementById("search-toggle");
  const searchInput = document.getElementById("file-search");

  searchToggle?.addEventListener("click", () => {
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

  searchInput?.addEventListener("input", function () {
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

  const previewBtn = document.getElementById("editor-preview");
  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      const on = !getPreviewOn();
      setPreviewOn(on);
      applyPreviewVisibility();
      if (on) {
        renderPreview().catch(() => {});
      }
      toast(`Preview ${on ? "ON" : "OFF"}`);
    });
  }

  // Symbols: keep only File Symbols (Workspace handled via modal toggle)
  document.getElementById("file-symbols")?.addEventListener("click", () => {
    openSymbolModal("file");
    toast("File Symbols");
  });

  // Grep button
  document.getElementById("workspace-grep")?.addEventListener("click", () => {
    openGrepModal();
    toast("Grep in Workspace");
  });

  // Hotkeys
  window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "t") {
      // Open Symbols modal defaulting to Workspace scope (toggle can switch to File)
      e.preventDefault();
      openSymbolModal("workspace");
      toast("Workspace Symbols (Ctrl+T)");
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      openSymbolModal("file");
      toast("File Symbols (Ctrl+Shift+O)");
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openGrepModal();
      toast("Grep in Workspace (Ctrl+Shift+F)");
    } else if (e.key === "Escape") {
      closeAllModals();
      statusCenter("Dismissed modals");
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
    } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward();
    }
  });

  updateNavButtons();
  applyPreviewVisibility();
  updatePreviewButtonVisibility();
});
