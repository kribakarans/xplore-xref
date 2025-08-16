let openTabs = [];
let activePath = null;
let openFilesCache = {};

function openTab(file) {
  console.log("[Tab] Opening file:", file.path);
  const existing = openTabs.find(t => t.path === file.path);
  if (existing) {
    console.log("[Tab] Already open, activating:", file.path);
    setActiveTab(existing.path);
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
  setActiveTab(file.path);
}

function setActiveTab(path) {
  console.log("[Tab] Setting active:", path);
  activePath = path;
  openTabs.forEach(tab => {
    tab.tabEl.classList.toggle("active", tab.path === path);
  });
  const activeFile = openTabs.find(t => t.path === path);
  if (activeFile) {
    const ext = activeFile.name.split(".").pop().toLowerCase();
    const lang = getLanguageFromExt(ext);
    console.log("[Editor] Setting language:", lang);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
    editor.setValue(activeFile.content);
  }
}

function closeTab(path) {
  console.log("[Tab] Closing tab:", path);
  const index = openTabs.findIndex(t => t.path === path);
  if (index !== -1) {
    openTabs[index].tabEl.remove();
    openTabs.splice(index, 1);
    if (activePath === path && openTabs.length > 0) {
      setActiveTab(openTabs[openTabs.length - 1].path);
    } else if (openTabs.length === 0) {
      editor.setValue("");
      activePath = null;
    }
  }
}

let editor;
let selectedItem = null;
let fullTree = null;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(["vs/editor/editor.main"], async function () {
  console.log("[Init] Monaco Editor starting...");
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    readOnly: true
  });

  console.log("[Tree] Loading full directory tree...");
  fullTree = await loadFullTree();
  console.log("[Tree] Full structure:", fullTree);
  renderTree(fullTree, document.getElementById("file-tree"));

  const searchToggle = document.getElementById("search-toggle");
  const searchInput = document.getElementById("file-search");

  searchToggle.addEventListener("click", () => {
    console.log("[Search] Toggle clicked");
    if (searchInput.style.display === "none") {
      searchInput.style.display = "block";
      searchInput.focus();
    } else {
      searchInput.style.display = "none";
      searchInput.value = "";
      renderTree(fullTree, document.getElementById("file-tree"), false);
    }
  });

  // Search input listener
  searchInput.addEventListener("input", function () {
    const query = this.value.trim().toLowerCase();
    console.log("[Search] Query:", query);
    if (!query) {
      renderTree(fullTree, document.getElementById("file-tree"), false);
      return;
    }
    const filtered = searchTree(query, fullTree);
    console.log("[Search] Filtered results:", filtered);
    renderTree(filtered, document.getElementById("file-tree"), true);
  });

  document.getElementById("editor-minimap").addEventListener("click", () => {
    console.log("[Editor] Toggling minimap");
    const current = editor.getOption(monaco.editor.EditorOption.minimap).enabled;
    editor.updateOptions({
      minimap: { enabled: !current }
    });
  });

  document.getElementById("editor-wrap").addEventListener("click", () => {
    console.log("[Editor] Toggling word wrap");
    const current = editor.getOption(monaco.editor.EditorOption.wordWrap);
    editor.updateOptions({
      wordWrap: current === "on" ? "off" : "on"
    });
  });

  document.getElementById("editor-symbols").addEventListener("click", () => {
    console.log("[Editor] Quick outline (go to symbol in file)");
    editor.getAction("editor.action.quickOutline").run();
  });

  document.getElementById("editor-search").addEventListener("click", () => {
    console.log("[Editor] Search in file");
    editor.getAction("actions.find").run();
  });
});

// Load static tree.json
async function loadFullTree() {
  console.log("[API] Loading static tree.json");
  const res = await fetch("data/tree.json");
  const tree = await res.json();
  return tree;
}

// Render tree from data
function renderTree(data, container, autoExpandParents = false) {
  console.log("[Tree] Rendering...", { autoExpandParents, nodes: data.length });
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

      // Auto-expand parents in search mode
      if (autoExpandParents && item.children && item.children.length > 0) {
        li.classList.add("expanded");
        subUl.style.display = "block";
      }

      li.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("[Tree] Folder click:", item.path);
        if (li.classList.contains("expanded")) {
          li.classList.remove("expanded");
          subUl.style.display = "none";
        } else {
          li.classList.add("expanded");
          subUl.style.display = "block";
        }
      });

      if (item.children && item.children.length) {
        renderTree(item.children, subUl, autoExpandParents);
      }
      li.appendChild(subUl);
    } else {
      // FILE
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("name");
      nameSpan.textContent = item.name;
      li.appendChild(nameSpan);
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        console.log("[Tree] File click:", item.path);
        selectItem(li);
        loadFile(item.path);
      });
    }
    container.appendChild(li);
  });
}

// Recursive search that keeps folder hierarchy
function searchTree(query, nodes) {
  const results = [];

  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(query);
    if (node.type === "dir") {
      const childMatches = searchTree(query, node.children || []);
      if (nameMatch || childMatches.length > 0) {
        results.push({
          ...node,
          children: nameMatch ? node.children : childMatches
        });
      }
    } else if (nameMatch) {
      results.push(node);
    }
  }
  return results;
}

// Load file directly from /files/
async function loadFile(path) {
  console.log("[API] Loading raw file:", path);
  try {
    const res = await fetch(`files/${path}`);
    if (!res.ok) {
      alert(`Error loading file: ${path}`);
      return;
    }
    const text = await res.text();
    const name = path.split("/").pop();
    openTab({
      name,
      path,
      content: text,
      binary: false
    });
  } catch (err) {
    console.error("[Error] Loading file:", err);
  }
}

// Select UI item
function selectItem(li) {
  if (selectedItem) selectedItem.classList.remove("selected");
  selectedItem = li;
  selectedItem.classList.add("selected");
}

// Map file extensions to Monaco languages
function getLanguageFromExt(ext) {
  const map = {
    js: "javascript",
    py: "python",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    txt: "plaintext",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    ts: "typescript",
    sh: "shell",
    mk: "makefile",
    rc: "shell",
    vim: "vim",
    lua: "lua"
  };
  return map[ext] || "plaintext";
}
