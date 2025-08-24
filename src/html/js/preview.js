// preview.js — preview system (markdown/html/media/docs)
import { escapeHtml, toB64Unicode } from "./utils.js";
import { statusCenter, toast } from "./status.js";
import { getActiveTab } from "./editor.js";

let previewOn = false;
const __tplCache = new Map();

export function getPreviewOn(){ return previewOn; }
export function setPreviewOn(v){ previewOn = !!v; applyPreviewVisibility(); }

export function canPreviewName(fileName) {
  if (!fileName) return false;
  const n = fileName.toLowerCase();
  return n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.html') || n.endsWith('.htm');
}
export function canPreviewBinaryName(fileName) {
  if (!fileName) return false;
  const n = fileName.toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|mp4|webm|ogv|pdf|docx|xlsx|xls|csv|pptx)$/.test(n);
}

export function applyPreviewVisibility() {
  const editorEl = document.getElementById('editor');
  const previewEl = document.getElementById('preview');
  const btn = document.getElementById('editor-preview');
  if (!editorEl || !previewEl) return;
  if (previewOn) {
    editorEl.style.display = 'none';
    previewEl.classList.add('show');
  } else {
    previewEl.classList.remove('show');
    editorEl.style.display = 'block';
  }
  if (btn) {
    btn.classList.toggle('active', previewOn);
    btn.setAttribute('aria-pressed', previewOn ? 'true' : 'false');
    btn.title = previewOn ? 'Preview ON (click to hide)' : 'Preview OFF (click to show)';
  }
}

export function updatePreviewButtonVisibility() {
  const btn = document.getElementById('editor-preview');
  const tab = getActiveTab();
  let ok = false;
  if (tab) ok = canPreviewName(tab.name) || canPreviewBinaryName(tab.name);
  if (!btn) return;
  btn.style.display = ok ? 'inline-block' : 'none';
  if (!ok && previewOn) previewOn = false;
  applyPreviewVisibility();
}

export async function loadTemplate(name, vars = {}) {
  const url = "__xplore/templates/" + name;
  let text = __tplCache.get(url);
  if (!text) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load template: " + url);
    text = await res.text();
    __tplCache.set(url, text);
  }
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp("\\{\\{"+k+"\\}\\}", "g");
    out = out.replace(re, String(v));
  }
  return out;
}

export function giveUpPreview(msg) {
  previewOn = false;
  applyPreviewVisibility();
  if (msg) statusCenter(msg);
  toast("Preview failed — back to editor", "warn");
}

export async function renderPreview() {
  const tab = getActiveTab();
  if (!tab) return;
  const frame = document.getElementById('preview-frame');
  if (!frame) return;
  const name = (tab.name || '').toLowerCase();
  const path = tab.path;

  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    const b64 = toB64Unicode(tab.content || "");
    try {
      const html = await loadTemplate("preview_md.html", { TITLE: escapeHtml(tab.name || "Markdown"), CONTENT_B64: b64 });
      frame.srcdoc = html;
    } catch (e) { giveUpPreview("Markdown preview template missing or failed to load"); }
    return;
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) { frame.srcdoc = tab.content || ''; return; }
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) {
    const html = await loadTemplate("preview_img.html", { TITLE: escapeHtml(tab.name), SRC: encodeURI(path), ALT: escapeHtml(tab.name) });
    frame.srcdoc = html; return;
  }
  if (/\.(mp3|ogg|wav)$/.test(name)) {
    const html = await loadTemplate("preview_audio.html", { TITLE: escapeHtml(tab.name), SRC: encodeURI(path), NAME: escapeHtml(tab.name) });
    frame.srcdoc = html; return;
  }
  if (/\.(mp4|webm|ogv)$/.test(name)) {
    const html = await loadTemplate("preview_video.html", { TITLE: escapeHtml(tab.name), SRC: encodeURI(path) });
    frame.srcdoc = html; return;
  }
  if (/\.pdf$/.test(name)) { frame.removeAttribute('srcdoc'); frame.setAttribute('src', path); return; }
  if (/\.docx$/.test(name)) {
    try {
      const res = await fetch(path); const buf = await res.arrayBuffer();
      if (window.mammoth) {
        const result = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        const html = await loadTemplate("preview_docx.html", { TITLE: escapeHtml(tab.name), BODY_HTML: result.value || "<p>(Empty)</p>" });
        frame.srcdoc = html;
      } else {
        const html = await loadTemplate("preview_fallback.html", { TITLE: "DOCX preview not available", MESSAGE: "Include <b>Mammoth.js</b> to enable DOCX preview.", FILE: escapeHtml(path) });
        frame.srcdoc = html;
      }
    } catch {
      const html = await loadTemplate("preview_fallback.html", { TITLE: "Failed to load DOCX", MESSAGE: "An error occurred while loading the document.", FILE: escapeHtml(path) });
      frame.srcdoc = html;
    }
    return;
  }
  if (/\.(xlsx|xls|csv)$/.test(name)) {
    try {
      const res = await fetch(path); const buf = await res.arrayBuffer();
      if (window.XLSX) {
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const tableHtml = XLSX.utils.sheet_to_html(sheet, { header: "<h3>"+escapeHtml(tab.name)+"</h3>" });
        const html = await loadTemplate("preview_xlsx.html", { TITLE: escapeHtml(tab.name), TABLE_HTML: tableHtml });
        frame.srcdoc = html;
      } else {
        const html = await loadTemplate("preview_fallback.html", { TITLE: "Spreadsheet preview not available", MESSAGE: "Include <b>SheetJS</b> to enable spreadsheet preview.", FILE: escapeHtml(path) });
        frame.srcdoc = html;
      }
    } catch {
      const html = await loadTemplate("preview_fallback.html", { TITLE: "Failed to load spreadsheet", MESSAGE: "An error occurred while loading the file.", FILE: escapeHtml(path) });
      frame.srcdoc = html;
    }
    return;
  }
  if (/\.pptx$/.test(name)) {
    const html = await loadTemplate("preview_pptx.html", { TITLE: escapeHtml(tab.name), FILE: escapeHtml(path) });
    frame.srcdoc = html; return;
  }
  frame.srcdoc = await loadTemplate("preview_fallback.html", { TITLE: "Preview not supported", MESSAGE: "This file type is not supported for preview.", FILE: escapeHtml(tab.name) });
}

// external message handler for markdown preview failure
window.addEventListener("message", (e) => {
  try { if (e && e.data && e.data.type === "xplore-md-failed") giveUpPreview("Preview error in Markdown iframe"); } catch {}
});
