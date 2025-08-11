let editor;
let selectedItem = null;

require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    readOnly: true
  });
  loadTree("");
});

async function loadTree(path) {
  try {
    const res = await fetch(`/api/tree?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    const container = path ? document.querySelector(`ul[data-path="${path}"]`) : document.getElementById("file-tree");
    container.innerHTML = "";

    data.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item.name;
      li.classList.add(item.type);

      if (item.type === "dir") {
        li.classList.add("folder");
        const arrow = document.createElement("span");
        arrow.classList.add("arrow");
        li.prepend(arrow);

        const subUl = document.createElement("ul");
        subUl.setAttribute("data-path", item.path);
        subUl.style.display = "none";

        li.addEventListener("click", (e) => {
          e.stopPropagation();
          if (li.classList.contains("expanded")) {
            li.classList.remove("expanded");
            subUl.style.display = "none";
          } else {
            li.classList.add("expanded");
            subUl.style.display = "block";
            if (subUl.childElementCount === 0) {
              loadTree(item.path);
            }
          }
        });
        li.appendChild(subUl);
      } else if (item.type === "file") {
        li.addEventListener("click", (e) => {
          e.stopPropagation();
          selectItem(li);
          loadFile(item.path);
        });
      }

      container.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading tree:", err);
  }
}

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

function selectItem(li) {
  if (selectedItem) selectedItem.classList.remove("selected");
  selectedItem = li;
  selectedItem.classList.add("selected");
}

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
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    ts: "typescript",
    sh: "shell"
  };
  return map[ext] || "plaintext";
}
