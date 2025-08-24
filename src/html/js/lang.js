// lang.js — language detection + heuristics
export function detectLanguageByFilename(name) {
  const n = String(name || "");
  if (/^Dockerfile$/i.test(n)) return "dockerfile";
  if (/^(Doxyfile|doxygen\.cfg)$/i.test(n)) return "ini";
  if (/\.doxy$/i.test(n)) return "ini";
  if (/^Makefile$/i.test(n)) return "plaintext";
  if (/\.mk$/i.test(n)) return "plaintext";
  if (/\.make$/i.test(n)) return "plaintext";
  if (/^\.(bashrc)$/i.test(n)) return "shell";
  if (/^\.(vimrc)$/i.test(n)) return "plaintext";
  return null;
}
export function getLanguageFromExt(ext) {
  const map = {
    js: "javascript", py: "python", pyw: "python", html: "html", css: "css", json: "json",
    md: "markdown", txt: "plaintext", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp",
    php: "php", rb: "ruby", go: "go", rs: "rust", ts: "typescript", sh: "shell", aliases: "shell",
    rc: "shell", in: "shell", vim: "plaintext", lua: "lua", cfg: "ini", yml: "yaml",
    toml: "ini", yaml: "yaml", makefile: "plaintext", tsx: "typescriptreact", jsx: "javascriptreact",
    bash: "shell", zsh: "shell", ksh: "shell", mjs: "javascript", cjs: "javascript",
    dockerfile: "dockerfile", ini: "ini", mk: "plaintext", make: "plaintext"
  };
  return map[ext] || "plaintext";
}
export function rankBySourcePref(p) {
  const header = ['.h', '.hpp', '.hh', '.hxx'];
  const source = ['.c', '.cc', '.cpp', '.cxx', '.m', '.mm', '.java', '.go', '.rs'];
  const ext = '.' + p.split('.').pop().toLowerCase();
  if (source.includes(ext)) return 0;
  if (header.includes(ext)) return 2;
  return 1;
}
export function inferTypeFromLine(line, symbol) {
  const idx = line.indexOf(symbol);
  if (idx <= 0) return null;
  const left = line.slice(0, idx);
  let s = left.replace(/\s+/g, " ").trim();
  s = s.split("=").shift().trim();
  s = s.replace(/\s*[*&]+\s*$/, "").trim();
  const mKW = s.match(/\b(struct|class|enum|union)\s+([A-Za-z_][\w:]*)\s*$/);
  if (mKW) return mKW[2];
  const mID = s.match(/([A-Za-z_][\w:<>]*?)\s*$/);
  if (mID) return mID[1].replace(/<.*>$/,"");
  return null;
}
