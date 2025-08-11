let editor;
let selectedItem = null;
let fullTree = null; // Store the full tree structure for searching

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(["vs/editor/editor.main"], async function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    readOnly: true
  });

  // Load the full tree recursively on startup
  fullTree = await loadFullTree("");
  renderTree(fullTree, document.getElementById("file-tree"));

  // Search toggle
  const searchToggle = document.getElementById("search-toggle");
  const searchInput = document.getElementById("file-search");

  searchToggle.addEventListener("click", () => {
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
    if (!query) {
      renderTree(fullTree, document.getElementById("file-tree"), false);
      return;
    }
    const filtered = searchTree(query, fullTree);
    renderTree(filtered, document.getElementById("file-tree"), true);
  });
});

// Recursively fetch the entire tree
async function loadFullTree(path) {
  const res = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
  const items = await res.json();

  for (const item of items) {
    if (item.type === "dir") {
      item.children = await loadFullTree(item.path);
    }
  }
  return items;
}

// Render tree from data
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

      // Auto-expand parents in search mode
      if (autoExpandParents && item.children && item.children.length > 0) {
        li.classList.add("expanded");
        subUl.style.display = "block";
      }

      li.addEventListener("click", (e) => {
        e.stopPropagation();
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

// Load file content into Monaco
async function loadFile(path) {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    if (data.error) {
      editor.setValue(`Error: ${data.error}`);
      return;
    }
    const ext = data.name.split(".").pop().toLowerCase();
    const lang = getLanguageFromExt(ext);
    monaco.editor.setModelLanguage(editor.getModel(), lang);
    editor.setValue(data.content);
  } catch (err) {
    console.error("Error loading file:", err);
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
    h: "cpp",          // Header files
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    ts: "typescript",
    sh: "shell",
    mk: "makefile",    // .mk files
    makefile: "makefile", // Makefile
    rc: "shell",       // .rc treated as bash
    vim: "vim",        // .vim scripts
    lua: "lua"         // Lua scripts
  };
  return map[ext] || "plaintext";
}
