// grep.js — workspace grep (string search)
import { registerModal } from "./modal.js";
import { collectAllFiles, isSearchableFile } from "./fs.js";
import { escapeHtml, escapeRegExp, limitConcurrency, shortenPath } from "./utils.js";
import { toast } from "./status.js";
import { navigateTo } from "./nav.js";
import { getFullTree } from "./editor.js";

const grepCtl     = registerModal("grep-modal", { closeOnOverlay: true });
const grepModal   = document.getElementById("grep-modal");
const grepResults = document.getElementById("grep-results");
const grepQuery   = document.getElementById("grep-query");
const grepClose   = document.getElementById("grep-close");
const grepProg    = document.getElementById("grep-progress");

export function openGrepModal() {
  grepResults.innerHTML = "";
  grepQuery.value = "";
  setProgress(null);
  grepCtl.open();
  setTimeout(() => grepQuery.focus(), 0);
}
export function closeGrepModal() { grepCtl.close(); }
grepClose?.addEventListener("click", closeGrepModal);

function setProgress(pct) {
  const wrap = grepProg;
  if (!wrap) return;
  const bar = wrap.querySelector(".bar");
  if (!bar) return;
  if (pct == null) {
    wrap.style.display = "none";
    bar.style.width = "0%";
  } else {
    wrap.style.display = "block";
    bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }
}

// Enter to search
grepQuery?.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const q = grepQuery.value.trim();
  if (!q) return;

  grepResults.innerHTML = "";
  setProgress(0);

  // Work from tree already loaded in memory
  const files = collectAllFiles(getFullTree()).filter(f => isSearchableFile(f.name, f.mimetype));

  let done = 0;
  const tasks = await limitConcurrency(files.map(f => async () => {
    try {
      const res = await fetch(f.path);
      if (!res.ok) return [];
      const text = await res.text();
      const regex = new RegExp(escapeRegExp(q), "g");
      const results = [];
      let m;
      while ((m = regex.exec(text)) && results.length < 20) {
        const pre = text.slice(0, m.index);
        const line = pre.split(/\r?\n/).length;
        const lineStart = text.lastIndexOf("\n", m.index - 1) + 1;
        const lineEnd = text.indexOf("\n", m.index);
        const snippet = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
        results.push({ path: f.path, line, snippet });
      }
      return results;
    } catch { return []; }
    finally {
      done++;
      setProgress(Math.round((done / files.length) * 100));
    }
  }), 8);

  setProgress(null);

  const found = tasks.flat();
  if (!found.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No matches found.";
    grepResults.appendChild(li);
    toast("No matches found", "warn");
    return;
  }

  for (const r of found) {
    const li = document.createElement("li");
    li.setAttribute("data-path", r.path);
    li.setAttribute("data-line", String(r.line));
    li.innerHTML = `<span class="codicon codicon-search"></span>
      <span class="name">${escapeHtml(shortenPath(r.path))}:${r.line}</span>
      <span class="dim">${escapeHtml(r.snippet)}</span>`;
    li.addEventListener("click", async () => {
      closeGrepModal();
      await navigateTo(r.path, r.line, null, { record: true });
    });
    grepResults.appendChild(li);
  }

  toast(`${found.length} matches in workspace`, "info");
});
