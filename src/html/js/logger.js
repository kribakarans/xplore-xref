// logger.js — tiny leveled logger using "LEVEL | message"
export function log(level, message, meta) {
  const ts = new Date().toISOString();
  const line = `${level.toUpperCase()} | ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else if (level === "warn") console.warn(line, meta ?? "");
  else if (level === "debug") console.debug(line, meta ?? "");
  else console.log(line, meta ?? "");
}
export const info = (m, meta) => log("info", m, meta);
export const warn = (m, meta) => log("warn", m, meta);
export const error = (m, meta) => log("error", m, meta);
export const debug = (m, meta) => log("debug", m, meta);
