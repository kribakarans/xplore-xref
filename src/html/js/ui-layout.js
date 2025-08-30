#!/usr/bin/env node
// ui-layout.js — Adjustable left/right panels (CSS variables + gutters) + Outline toggle + Monaco relayout
// Logs: "LEVEL | message"
import { getEditor } from "./editor.js";

const STORAGE = {
  left: "ui:leftPaneWidth",
  right: "ui:rightPaneWidth",
  outlineHidden: "ui:outlineHidden"
};

const log = {
  debug: m => console.debug(`DEBUG | ${m}`),
  info:  m => console.info (`INFO  | ${m}`),
  warn:  m => console.warn (`WARN  | ${m}`),
  error: m => console.error(`ERROR | ${m}`)
};

const readVar  = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const writeVar = (n, v) => document.documentElement.style.setProperty(n, v);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const pxToNum = px => Number(String(px).replace("px", "")) || 0;

function persistWidth(side, px) {
  localStorage.setItem(side === "left" ? STORAGE.left : STORAGE.right, String(px));
  log.info(`Persisted ${side} pane = ${px}px`);
}
function restoreWidth(side) {
  const key = side === "left" ? STORAGE.left : STORAGE.right;
  const v = localStorage.getItem(key);
  return v ? Number(v) : null;
}

/* ---- Helpers ---- */
function isMobile() {
  return window.innerWidth <= 768;
}

/* ---- Outline toggle (default visible) ---- */
function getOutlineHidden() {
  const v = localStorage.getItem(STORAGE.outlineHidden);
  if (v === null) return false; // default visible
  return v === "true";
}
function setOutlineHidden(hidden) {
  document.body.classList.toggle("outline-hidden", hidden);
  const btn = document.getElementById("toggle-outline");
  if (btn) {
    btn.classList.remove("codicon-layout-sidebar-right-off", "codicon-layout-sidebar-right");
    btn.classList.add(hidden ? "codicon-layout-sidebar-right-off" : "codicon-layout-sidebar-right");
    btn.title = hidden ? "Show Outline panel" : "Hide Outline panel";
    btn.setAttribute("aria-pressed", String(!hidden));
  }
  localStorage.setItem(STORAGE.outlineHidden, String(hidden));
  positionGutters();
  relayoutEditorSoon();
  log.info(`Outline panel ${hidden ? "hidden" : "shown"}`);
}

/* ---- Align gutters ---- */
function positionGutters() {
  const grid    = document.getElementById("app");
  const leftEl  = document.getElementById("sidebar");
  const rightEl = document.getElementById("right");

  // ✅ support both mainview and viewport
  const mainEl  = document.getElementById("main") || document.getElementById("viewport-main");

  const gLeft   = document.querySelector(".gutter-left");
  const gRight  = document.querySelector(".gutter-right");
  if (!grid || !mainEl || !gLeft) return;

  const gridRect = grid.getBoundingClientRect();
  const mainRect = mainEl.getBoundingClientRect();
  const hit      = pxToNum(readVar("--gutter-hit")) || 8;

  const top = mainRect.top - gridRect.top;
  const height = mainRect.height;

  gLeft.style.top = `${top}px`;
  gLeft.style.height = `${height}px`;

  if (leftEl) {
    const leftRect = leftEl.getBoundingClientRect();
    const leftSeamX = leftRect.right - gridRect.left;
    gLeft.style.left = `calc(${leftSeamX}px - ${hit/2}px)`;
  } else {
    gLeft.style.display = "none";
  }

  if (gRight) {
    const outlineHidden = document.body.classList.contains("outline-hidden");
    if (outlineHidden || !rightEl) {
      gRight.style.display = "none";
    } else {
      gRight.style.display = "block";
      const rightRect = rightEl.getBoundingClientRect();
      const rightSeamX = gridRect.right - rightRect.left;
      gRight.style.top = `${top}px`;
      gRight.style.height = `${height}px`;
      gRight.style.right = `calc(${rightSeamX}px - ${hit/2}px)`;
    }
  }
}

/* ---- Monaco relayout ---- */
function relayoutEditorSoon() {
  const ed = getEditor && getEditor();
  if (!ed) return;

  requestAnimationFrame(() => {
    try { ed.layout(); } catch {}
    log.debug("Monaco layout refreshed (pass 1)");
  });

  const app = document.getElementById("app");
  if (app) {
    const ro = new ResizeObserver(() => {
      try { ed.layout(); } catch (e) {
        log.warn(`Monaco relayout failed in ResizeObserver: ${e?.message || e}`);
      }
      log.debug("Monaco layout refreshed (pass 2 via ResizeObserver)");
      ro.disconnect();
    });
    ro.observe(app);
  }
}

/* ---- Drag-to-resize ---- */
function setupGutter(gutterEl, side) {
  if (!gutterEl) return;
  const isLeft = side === "left";

  const minPx = () => pxToNum(readVar(isLeft ? "--min-left" : "--min-right"));
  const maxPx = () => pxToNum(readVar(isLeft ? "--max-left" : "--max-right"));

  let dragging = false;
  let raf = 0;

  const moveTo = (clientX) => {
    const grid = document.getElementById("app").getBoundingClientRect();
    let px = isLeft ? (clientX - grid.left) : (grid.right - clientX);
    px = clamp(px, minPx(), maxPx());
    writeVar(isLeft ? "--left-pane" : "--right-pane", `${px}px`);
    positionGutters();
    relayoutEditorSoon();
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    if (raf) return;
    const x = e.clientX;
    raf = requestAnimationFrame(() => { raf = 0; moveTo(x); });
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    dragging = true;
    gutterEl.classList.add("is-dragging");
    gutterEl.setPointerCapture?.(e.pointerId);
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    gutterEl.classList.remove("is-dragging");
    const finalPx = pxToNum(readVar(isLeft ? "--left-pane" : "--right-pane"));
    persistWidth(side, finalPx);
    relayoutEditorSoon();
  };

  gutterEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);

  // Keyboard resize
  gutterEl.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 10;
    let curr = pxToNum(readVar(isLeft ? "--left-pane" : "--right-pane"));
    if (e.key === "ArrowLeft")  curr += isLeft ? -step : step;
    if (e.key === "ArrowRight") curr += isLeft ?  step : -step;
    curr = clamp(curr, minPx(), maxPx());
    writeVar(isLeft ? "--left-pane" : "--right-pane", `${curr}px`);
    persistWidth(side, curr);
    positionGutters();
    relayoutEditorSoon();
  });

  gutterEl.addEventListener("dblclick", () => {
    const reset = isLeft ? 240 : 280;
    writeVar(isLeft ? "--left-pane" : "--right-pane", `${reset}px`);
    persistWidth(side, reset);
    positionGutters();
    relayoutEditorSoon();
  });
}

/* ---- Init ---- */
function applyInitialWidths() {
  if (isMobile()) {
    log.info("Mobile detected: skipping persisted pane widths.");
    return;
  }
  const l = restoreWidth("left");
  const r = restoreWidth("right");

  if (Number.isFinite(l)) writeVar("--left-pane", `${l}px`);

  const outlineHidden = getOutlineHidden();
  if (!outlineHidden && Number.isFinite(r)) {
    writeVar("--right-pane", `${r}px`);
  } else {
    log.info("Outline hidden: ignoring persisted right pane width.");
  }
}

function init() {
  try {
    applyInitialWidths();
    setOutlineHidden(getOutlineHidden());

    positionGutters();

    setupGutter(document.querySelector(".gutter-left"), "left");
    setupGutter(document.querySelector(".gutter-right"), "right");

    const ro = new ResizeObserver(positionGutters);
    ro.observe(document.getElementById("app"));
    window.addEventListener("resize", positionGutters);

    const btn = document.getElementById("toggle-outline");
    if (btn) btn.addEventListener("click", () => {
      const hidden = document.body.classList.contains("outline-hidden");
      setOutlineHidden(!hidden);
    });

    requestAnimationFrame(relayoutEditorSoon);

    log.info("Grid layout ready (resizable side panels + outline toggle).");
  } catch (err) {
    log.error(`Layout init failed: ${err?.message || err}`);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
