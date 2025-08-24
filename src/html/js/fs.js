// fs.js — fetch helpers
export async function loadFullTree() {
  const res = await fetch("__xplore/tree.json");
  return await res.json();
}
export async function loadFile(path) {
  const res = await fetch(`${path}`);
  if (!res.ok) throw new Error(`Fetch failed: ${path}`);
  const text = await res.text();
  const name = path.split("/").pop();
  return { name, path, content: text };
}
export function collectAllFiles(nodes, acc = []) {
  for (const n of nodes) {
    if (n.type === "file") acc.push(n);
    if (n.children) collectAllFiles(n.children, acc);
  }
  return acc;
}
export function isSearchableFile(name, mimetype) {
  const ext = name.split(".").pop().toLowerCase();
  const codey = ["c","h","cpp","hpp","hh","hxx","cc","py","js","ts","java","go","rs","rb","php","sh","mk","mak","rc","vim","lua","json","yaml","yml","toml","md","txt","html","css","cfg","in","jsx","tsx","mjs","cjs","bash","zsh","ksh","makefile","make"];
  if (name.toLowerCase() === "makefile") return true;
  return codey.includes(ext) || (mimetype && mimetype.startsWith("text/"));
}
