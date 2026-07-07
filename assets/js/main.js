// main.js — orchestrates the whole face-alignment workflow.
// Framework-free ES module. Everything runs client-side; no photo ever leaves
// the browser.

import { DEFAULT_LAYOUT, renderFrame } from "./align.js";
import { canRecord, recordAnimation } from "./recorder.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Photo
 * @property {string} id
 * @property {string} name
 * @property {HTMLImageElement} img
 * @property {string} url               Object URL (revoked on remove).
 * @property {{x:number,y:number}|null} leftEye   In image pixel coords.
 * @property {{x:number,y:number}|null} rightEye
 */

const state = {
  /** @type {Photo[]} */
  photos: [],
  markingIndex: 0,
  /** @type {HTMLCanvasElement[]} pre-rendered aligned frames */
  frames: [],
  layout: { ...DEFAULT_LAYOUT },
  fps: 6,
  loops: 3,
  playing: false,
  previewIndex: 0,
  lastTick: 0,
};

let uid = 0;
const nextId = () => `p${uid++}`;

// ---------------------------------------------------------------------------
// Element lookup
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {};

function cacheEls() {
  [
    "dropzone", "file-input", "photo-strip", "empty-hint",
    "mark-section", "mark-canvas", "mark-status", "loupe",
    "btn-prev", "btn-next", "btn-reset-marks", "mark-progress",
    "opt-size", "opt-eyey", "opt-eyey-val", "opt-gap", "opt-gap-val",
    "opt-bg", "opt-fps", "opt-fps-val", "opt-loops", "opt-loops-val",
    "preview-section", "preview-canvas", "btn-play", "frame-scrub",
    "frame-label", "empty-preview",
    "export-section", "btn-export", "export-status", "download-area",
    "export-note",
  ].forEach((id) => {
    els[id] = $(id);
  });
}

// ---------------------------------------------------------------------------
// Photo loading
// ---------------------------------------------------------------------------

function loadFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
  let loaded = 0;
  files.forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      state.photos.push({
        id: nextId(),
        name: file.name,
        img,
        url,
        leftEye: null,
        rightEye: null,
      });
      loaded += 1;
      if (loaded === files.length) {
        renderStrip();
        ensureMarkingValid();
        refreshAll();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      loaded += 1;
    };
    img.src = url;
  });
}

function removePhoto(id) {
  const idx = state.photos.findIndex((p) => p.id === id);
  if (idx === -1) return;
  URL.revokeObjectURL(state.photos[idx].url);
  state.photos.splice(idx, 1);
  if (state.markingIndex >= state.photos.length) {
    state.markingIndex = Math.max(0, state.photos.length - 1);
  }
  renderStrip();
  ensureMarkingValid();
  refreshAll();
}

function movePhoto(id, delta) {
  const idx = state.photos.findIndex((p) => p.id === id);
  const target = idx + delta;
  if (idx === -1 || target < 0 || target >= state.photos.length) return;
  const [p] = state.photos.splice(idx, 1);
  state.photos.splice(target, 0, p);
  renderStrip();
  refreshAll();
}

// ---------------------------------------------------------------------------
// Photo strip
// ---------------------------------------------------------------------------

function renderStrip() {
  const strip = els["photo-strip"];
  strip.innerHTML = "";
  els["empty-hint"].hidden = state.photos.length > 0;

  state.photos.forEach((p, i) => {
    const done = p.leftEye && p.rightEye;
    const card = document.createElement("div");
    card.className = "thumb" + (i === state.markingIndex ? " active" : "");

    const im = document.createElement("img");
    im.src = p.url;
    im.alt = p.name;
    im.addEventListener("click", () => {
      state.markingIndex = i;
      renderStrip();
      renderMarkCanvas();
      updateMarkStatus();
    });

    const badge = document.createElement("span");
    badge.className = "badge " + (done ? "ok" : "todo");
    badge.textContent = done ? "✓ marked" : "needs eyes";

    const controls = document.createElement("div");
    controls.className = "thumb-controls";
    controls.append(
      iconBtn("↑", "Move earlier", () => movePhoto(p.id, -1)),
      iconBtn("↓", "Move later", () => movePhoto(p.id, 1)),
      iconBtn("✕", "Remove", () => removePhoto(p.id))
    );

    card.append(im, badge, controls);
    strip.append(card);
  });
}

function iconBtn(label, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", onClick);
  return b;
}

// ---------------------------------------------------------------------------
// Eye marking
// ---------------------------------------------------------------------------

function currentPhoto() {
  return state.photos[state.markingIndex] || null;
}

function ensureMarkingValid() {
  const has = state.photos.length > 0;
  els["mark-section"].hidden = !has;
  if (has) renderMarkCanvas();
  updateMarkStatus();
}

// Fit the current photo into the mark canvas and remember the scale so we can
// convert clicks back to image coordinates.
let markView = { scale: 1, offsetX: 0, offsetY: 0 };

function renderMarkCanvas() {
  const p = currentPhoto();
  const canvas = els["mark-canvas"];
  const ctx = canvas.getContext("2d");
  if (!p) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const maxW = canvas.parentElement.clientWidth || 640;
  const maxH = 460;
  const scale = Math.min(maxW / p.img.naturalWidth, maxH / p.img.naturalHeight, 1);
  const w = Math.round(p.img.naturalWidth * scale);
  const h = Math.round(p.img.naturalHeight * scale);
  canvas.width = w;
  canvas.height = h;
  markView = { scale, offsetX: 0, offsetY: 0 };

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(p.img, 0, 0, w, h);
  drawEyeMarks(ctx, p, scale);
}

function drawEyeMarks(ctx, p, scale) {
  const marks = [
    { pt: p.leftEye, color: "#22d3ee", label: "L" },
    { pt: p.rightEye, color: "#f472b6", label: "R" },
  ];
  if (p.leftEye && p.rightEye) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.leftEye.x * scale, p.leftEye.y * scale);
    ctx.lineTo(p.rightEye.x * scale, p.rightEye.y * scale);
    ctx.stroke();
  }
  marks.forEach((m) => {
    if (!m.pt) return;
    const x = m.pt.x * scale;
    const y = m.pt.y * scale;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillText(m.label, x + 9, y - 9);
  });
}

function canvasToImage(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cx = (clientX - rect.left) * (canvas.width / rect.width);
  const cy = (clientY - rect.top) * (canvas.height / rect.height);
  return { x: cx / markView.scale, y: cy / markView.scale };
}

function handleMarkClick(ev) {
  const p = currentPhoto();
  if (!p) return;
  const pt = canvasToImage(els["mark-canvas"], ev.clientX, ev.clientY);
  // First click (or after a reset) sets the left eye; second sets the right.
  if (!p.leftEye || (p.leftEye && p.rightEye)) {
    p.leftEye = pt;
    p.rightEye = null;
  } else {
    p.rightEye = pt;
  }
  renderMarkCanvas();
  updateMarkStatus();
  renderStrip();
  refreshAll();
}

function updateMarkStatus() {
  const p = currentPhoto();
  const status = els["mark-status"];
  if (!p) {
    status.textContent = "";
  } else if (!p.leftEye) {
    status.innerHTML = `Photo ${state.markingIndex + 1} of ${state.photos.length}: click the eye on the <b>left side of the photo</b>.`;
  } else if (!p.rightEye) {
    status.innerHTML = `Now click the eye on the <b>right side of the photo</b>.`;
  } else {
    status.innerHTML = `<b>✓ Both eyes marked.</b> Click again to redo, or move to the next photo.`;
  }
  const marked = state.photos.filter((p) => p.leftEye && p.rightEye).length;
  els["mark-progress"].textContent = `${marked} of ${state.photos.length} photos marked`;
}

// --- Loupe (magnifier) for precise clicking ---
function moveLoupe(ev) {
  const p = currentPhoto();
  const loupe = els["loupe"];
  if (!p) {
    loupe.hidden = true;
    return;
  }
  const canvas = els["mark-canvas"];
  const rect = canvas.getBoundingClientRect();
  const withinX = ev.clientX >= rect.left && ev.clientX <= rect.right;
  const withinY = ev.clientY >= rect.top && ev.clientY <= rect.bottom;
  if (!withinX || !withinY) {
    loupe.hidden = true;
    return;
  }
  loupe.hidden = false;
  const size = 120;
  const zoom = 3;
  const imgPt = canvasToImage(canvas, ev.clientX, ev.clientY);
  const lctx = loupe.getContext("2d");
  loupe.width = size;
  loupe.height = size;
  lctx.imageSmoothingEnabled = false;
  const src = size / zoom;
  lctx.drawImage(
    p.img,
    imgPt.x - src / 2, imgPt.y - src / 2, src, src,
    0, 0, size, size
  );
  // crosshair
  lctx.strokeStyle = "rgba(255,60,60,0.9)";
  lctx.lineWidth = 1;
  lctx.beginPath();
  lctx.moveTo(size / 2, 0);
  lctx.lineTo(size / 2, size);
  lctx.moveTo(0, size / 2);
  lctx.lineTo(size, size / 2);
  lctx.stroke();

  // Position the loupe near the cursor but inside the viewport.
  const pad = 16;
  let lx = ev.clientX + pad;
  let ly = ev.clientY + pad;
  if (lx + size > window.innerWidth) lx = ev.clientX - size - pad;
  if (ly + size > window.innerHeight) ly = ev.clientY - size - pad;
  loupe.style.left = `${lx}px`;
  loupe.style.top = `${ly}px`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SIZE_PRESETS = {
  "square": { width: 720, height: 720 },
  "portrait": { width: 720, height: 960 },
  "landscape": { width: 960, height: 720 },
};

function readSettings() {
  const preset = SIZE_PRESETS[els["opt-size"].value] || SIZE_PRESETS.square;
  state.layout.width = preset.width;
  state.layout.height = preset.height;
  state.layout.eyeY = Number(els["opt-eyey"].value) / 100;
  state.layout.eyeGap = Number(els["opt-gap"].value) / 100;
  state.layout.background = els["opt-bg"].value;
  state.fps = Number(els["opt-fps"].value);
  state.loops = Number(els["opt-loops"].value);

  els["opt-eyey-val"].textContent = `${els["opt-eyey"].value}%`;
  els["opt-gap-val"].textContent = `${els["opt-gap"].value}%`;
  els["opt-fps-val"].textContent = `${els["opt-fps"].value} fps`;
  els["opt-loops-val"].textContent = `${els["opt-loops"].value}×`;
}

// ---------------------------------------------------------------------------
// Frame building + preview
// ---------------------------------------------------------------------------

function markedPhotos() {
  return state.photos.filter((p) => p.leftEye && p.rightEye);
}

function rebuildFrames() {
  state.frames = markedPhotos().map((p) =>
    renderFrame(p.img, p.leftEye, p.rightEye, state.layout)
  );
  if (state.previewIndex >= state.frames.length) state.previewIndex = 0;

  const preview = els["preview-canvas"];
  preview.width = state.layout.width;
  preview.height = state.layout.height;

  const scrub = els["frame-scrub"];
  scrub.max = Math.max(0, state.frames.length - 1);
  scrub.value = state.previewIndex;

  const ready = state.frames.length > 0;
  els["empty-preview"].hidden = ready;
  els["preview-canvas"].hidden = !ready;
  els["export-section"].hidden = !ready;
  drawPreviewFrame(state.previewIndex);
  updateFrameLabel();
}

function drawPreviewFrame(index) {
  const preview = els["preview-canvas"];
  const ctx = preview.getContext("2d");
  ctx.clearRect(0, 0, preview.width, preview.height);
  const frame = state.frames[index];
  if (frame) ctx.drawImage(frame, 0, 0);
}

function updateFrameLabel() {
  const n = state.frames.length;
  els["frame-label"].textContent = n
    ? `Frame ${state.previewIndex + 1} / ${n}`
    : "No frames";
}

function tick(ts) {
  if (!state.playing) return;
  if (state.frames.length < 1) {
    pause();
    return;
  }
  const frameDur = 1000 / state.fps;
  if (ts - state.lastTick >= frameDur) {
    state.lastTick = ts;
    state.previewIndex = (state.previewIndex + 1) % state.frames.length;
    drawPreviewFrame(state.previewIndex);
    els["frame-scrub"].value = state.previewIndex;
    updateFrameLabel();
  }
  requestAnimationFrame(tick);
}

function play() {
  if (state.frames.length < 1) return;
  state.playing = true;
  state.lastTick = 0;
  els["btn-play"].textContent = "⏸ Pause";
  requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  els["btn-play"].textContent = "▶ Play";
}

function togglePlay() {
  state.playing ? pause() : play();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function doExport() {
  if (state.frames.length < 1) return;
  pause();
  const btn = els["btn-export"];
  btn.disabled = true;
  els["download-area"].innerHTML = "";
  els["export-status"].textContent = "Recording…";

  const preview = els["preview-canvas"];
  try {
    const { blob, extension } = await recordAnimation(
      preview,
      (i) => drawPreviewFrame(i),
      {
        frameCount: state.frames.length,
        fps: state.fps,
        loops: state.loops,
        onProgress: (p) => {
          els["export-status"].textContent = `Recording… ${Math.round(p * 100)}%`;
        },
      }
    );
    const url = URL.createObjectURL(blob);
    const size = (blob.size / 1024).toFixed(0);
    const link = document.createElement("a");
    link.href = url;
    link.download = `face-animation.${extension}`;
    link.className = "btn primary";
    link.textContent = `⬇ Download video (.${extension}, ${size} KB)`;
    els["download-area"].append(link);
    els["export-status"].textContent = "Done.";
  } catch (err) {
    els["export-status"].textContent = `Could not record: ${err.message}`;
  } finally {
    btn.disabled = false;
    drawPreviewFrame(state.previewIndex);
  }
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

function refreshAll() {
  rebuildFrames();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wire() {
  // File input + dropzone
  els["file-input"].addEventListener("change", (e) => {
    loadFiles(e.target.files);
    e.target.value = "";
  });
  const dz = els["dropzone"];
  dz.addEventListener("click", () => els["file-input"].click());
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els["file-input"].click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("drag");
    })
  );
  dz.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) loadFiles(e.dataTransfer.files);
  });

  // Mark canvas
  const mc = els["mark-canvas"];
  mc.addEventListener("click", handleMarkClick);
  mc.addEventListener("pointermove", moveLoupe);
  mc.addEventListener("pointerleave", () => (els["loupe"].hidden = true));

  els["btn-prev"].addEventListener("click", () => {
    if (state.markingIndex > 0) state.markingIndex -= 1;
    renderStrip();
    renderMarkCanvas();
    updateMarkStatus();
  });
  els["btn-next"].addEventListener("click", () => {
    if (state.markingIndex < state.photos.length - 1) state.markingIndex += 1;
    renderStrip();
    renderMarkCanvas();
    updateMarkStatus();
  });
  els["btn-reset-marks"].addEventListener("click", () => {
    const p = currentPhoto();
    if (!p) return;
    p.leftEye = null;
    p.rightEye = null;
    renderMarkCanvas();
    updateMarkStatus();
    renderStrip();
    refreshAll();
  });

  // Settings
  ["opt-size", "opt-eyey", "opt-gap", "opt-bg", "opt-fps", "opt-loops"].forEach(
    (id) =>
      els[id].addEventListener("input", () => {
        readSettings();
        refreshAll();
      })
  );

  // Preview controls
  els["btn-play"].addEventListener("click", togglePlay);
  els["frame-scrub"].addEventListener("input", (e) => {
    pause();
    state.previewIndex = Number(e.target.value);
    drawPreviewFrame(state.previewIndex);
    updateFrameLabel();
  });

  // Export
  els["btn-export"].addEventListener("click", doExport);

  window.addEventListener("resize", () => {
    if (currentPhoto()) renderMarkCanvas();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init() {
  cacheEls();
  wire();
  readSettings();
  renderStrip();
  ensureMarkingValid();
  rebuildFrames();

  if (!canRecord()) {
    els["export-note"].textContent =
      "Note: video export isn't supported in this browser, but live preview still works. Try a recent Safari, Chrome, or Edge.";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
