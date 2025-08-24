// status.js — toast and statusbar
import { shortenPath } from "./utils.js";

let __toastTimer = null;

export function toast(msg, type = 'info', timeout = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = '';
  el.textContent = String(msg || '');
  el.classList.add(type);
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => {
    el.classList.remove('show', 'info', 'warn', 'error');
  }, timeout);
  statusCenter(msg);
}

export function statusLeft(text) {
  const el = document.getElementById('status-left');
  if (el) el.innerHTML = text;
}
export function statusCenter(text) {
  const el = document.getElementById('status-center');
  if (el) el.textContent = text;
}
export function statusRight(text) {
  const el = document.getElementById('status-right');
  if (el) el.textContent = text;
}

export function setFileStatus(path, lang) {
  statusLeft(`<span class="codicon codicon-file"></span> ${escapeHtml(shortenPath(path || '—'))} • ${lang || 'plaintext'}`);
}

export function updateCursorStatus(editor) {
  if (!editor) return;
  const pos = editor.getPosition();
  const wrap = editor.getOption(monaco.editor.EditorOption.wordWrap);
  const mini = editor.getOption(monaco.editor.EditorOption.minimap).enabled;
  statusRight(`Ln ${pos?.lineNumber || 1}, Col ${pos?.column || 1} • WRAP: ${wrap === 'on' ? 'ON' : 'OFF'} • MINIMAP: ${mini ? 'ON' : 'OFF'}`);
}

// local escape to avoid circular import
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}
