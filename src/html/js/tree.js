// tree.js — file tree + search
import { navigateTo } from "./nav.js";

let selectedItem = null;

// Helper: detect mobile view
function isMobileView() {
  return window.innerWidth <= 768;
}

export function renderTree(data, container, autoExpandParents = false) {
  container.innerHTML = "";
  data.forEach(item => {
    const li = document.createElement("li");
    li.classList.add(item.type === "dir" ? "folder" : "file");
    li.dataset.path = item.path;

    if (item.type === "dir") {
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
        } else {
          li.classList.add("expanded");
          subUl.style.display = "block";
        }
        // Update shading & context after toggling
        markActiveContext();
        updateTreeShadingFallback();
      });

      if (item.children && item.children.length) renderTree(item.children, subUl, autoExpandParents);
      li.appendChild(subUl);
    } else {
      const nameSpan = document.createElement("span");
      nameSpan.classList.add("name");
      nameSpan.textContent = item.name;
      li.appendChild(nameSpan);

      li.addEventListener("click", (e) => {
        e.stopPropagation();
        selectItem(li);

        if (isMobileView()) {
          // 🚀 On mobile → open directly in viewport.html (new tab)
          const url = new URL("viewport.html", location.href);
          url.searchParams.set("path", item.path);
          window.open(url.toString(), "_blank", "noopener");
        } else {
          // Desktop → navigate in-app editor
          navigateTo(item.path, null, null, { record: true });
        }
      });
    }

    container.appendChild(li);
  });

  // Initial pass
  markActiveContext();
  updateTreeShadingFallback();
}

function selectItem(li) {
  if (selectedItem) selectedItem.classList.remove("selected");
  selectedItem = li;
  selectedItem.classList.add("selected");
  // Refresh active-context markers whenever selection changes
  markActiveContext();
  updateTreeShadingFallback();
}

/**
 * Mark all expanded folder ancestors of the selected item as .active-context.
 * Clears the class from everyone else.
 */
function markActiveContext() {
  // Clear all
  document.querySelectorAll("#file-tree li.folder.active-context")
    .forEach(n => n.classList.remove("active-context"));

  if (!selectedItem) return;

  // Walk up from the selected item, mark expanded folder ancestors
  let node = selectedItem;
  while (node && node !== document.getElementById("file-tree")) {
    if (node.classList?.contains?.("folder") && node.classList.contains("expanded")) {
      node.classList.add("active-context");
    }
    node = node.parentElement?.closest?.("li.folder");
  }
}

/**
 * JS fallback (for browsers without :has()):
 * Shade only the deepest expanded folder within the .active-context chain.
 * Applies .shade-block to that folder.
 */
function updateTreeShadingFallback() {
  // Remove any previous fallback shade
  document.querySelectorAll("#file-tree li.folder.shade-block")
    .forEach(n => n.classList.remove("shade-block"));

  const activeFolders = Array.from(document.querySelectorAll("#file-tree li.folder.expanded.active-context"));
  if (activeFolders.length === 0) return;

  // The deepest one is the farthest from the root; pick the one with no active-context child
  let deepest = null;
  for (const f of activeFolders) {
    const hasActiveChild = f.querySelector(":scope > ul > li.folder.expanded.active-context");
    if (!hasActiveChild) { deepest = f; break; }
  }
  (deepest || activeFolders[activeFolders.length - 1])?.classList.add("shade-block");
}

export function searchTree(query, nodes) {
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
