// tags.js — workspace symbols
import { toast, statusCenter } from "./status.js";

export let workspaceTags = [];
export const symbolsByFile = new Map();

export async function loadWorkspaceTags() {
  try {
    const resp = await fetch("__xplore/tags.json");
    if (!resp.ok) throw new Error(`Failed to load tags.json: ${resp.status}`);
    const text = await resp.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    workspaceTags = [];
    symbolsByFile.clear();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (!obj.name || !obj.path) continue;
        const entry = {
          name: obj.name,
          path: String(obj.path).replace(/\\/g, '/'),
          line: (typeof obj.line === "number") ? obj.line : (obj.line ? Number(obj.line) : null),
          pattern: obj.pattern || null,
          kind: obj.kind || '',
          language: obj.language || '',
          scope: obj.scope || '',
          scopeKind: obj.scopeKind || '',
          signature: obj.signature || obj.sig || null,
          typeref: obj.typeref || null
        };
        workspaceTags.push(entry);
        if (!symbolsByFile.has(entry.path)) symbolsByFile.set(entry.path, []);
        symbolsByFile.get(entry.path).push(entry);
      } catch {}
    }
    const msg = `[Tags] Loaded ${workspaceTags.length} symbols across ${symbolsByFile.size} files`;
    toast(msg, "info");
    statusCenter(msg);
  } catch (e) {
    toast("Failed to load tags.json", "error", 3000);
  }
}
