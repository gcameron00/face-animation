# Implementation Plan

This document captures the design decisions and the build-out roadmap for the
Face Animation app.

## Goals & constraints

- **Framework-free**: plain HTML, CSS, and JavaScript (ES modules).
- **No third-party runtime code**: only browser-native APIs.
- **Fully client-side**: photos never leave the device (privacy + zero backend).
- **Static hosting** on Cloudflare Pages free tier, no build step.
- **Target browsers**: Safari (Mac/iOS), Edge/Chrome (Windows).

## Architecture

A single static page drives a five-step workflow. State lives in one in-memory
object in `main.js`; there is no persistence or network I/O.

```
index.html ──┬── assets/css/styles.css   base styles
             ├── assets/css/app.css      app components
             └── assets/js/main.js  (ES module entry)
                     ├── align.js        alignment math + frame rendering
                     └── recorder.js     MediaRecorder export
```

### Modules

- **`align.js`** — pure functions, no DOM state.
  - `computeTransform(leftEye, rightEye, layout)` → `{angle, scale, midpoint, target}`
  - `drawAligned(ctx, image, leftEye, rightEye, layout)` — draws one aligned frame.
  - `renderFrame(...)` — renders to a fresh offscreen canvas.
- **`recorder.js`** — `pickMimeType()`, `canRecord()`, `recordAnimation()`.
- **`main.js`** — photo loading, eye-marking UI (with magnifier loupe),
  settings, preview loop, and export wiring.

### The alignment math

Given the left/right eye points in a photo's own pixel coordinates, we apply a
similarity transform so that a source point `p` maps to:

```
out = Rotate(-angle) · scale · (p - midpoint) + target
```

where

- `angle   = atan2(rightEye - leftEye)` — rotation to make the eye line level,
- `scale   = (eyeGap · frameWidth) / |rightEye - leftEye|` — uniform scale to a
  fixed inter-eye distance,
- `midpoint` = the point halfway between the eyes (source space),
- `target`   = the fixed on-frame eye midpoint (`frameWidth/2`, `frameHeight·eyeY`).

On the canvas this is expressed as `translate(target) → rotate(-angle) →
scale → translate(-midpoint) → drawImage`.

### Animation & export

- **Preview**: pre-render each marked photo to an offscreen canvas, then blit
  them in order with `requestAnimationFrame` at the chosen fps.
- **Export**: `canvas.captureStream(fps)` + `MediaRecorder`, choosing the first
  supported MIME type (MP4/H.264 → WebM/VP9 → …). Plays through the frames for a
  configurable number of loops, then downloads the blob.

## Build-out roadmap

### Phase 0 — Scaffold ✅
Static Cloudflare Pages scaffold (`index.html`, `about/`, assets).

### Phase 1 — MVP (this build) ✅
- Multi-photo upload (file picker + drag-and-drop).
- Manual eye marking with a magnifier loupe.
- Alignment math + per-frame rendering.
- Live preview with speed control and frame scrubbing.
- Photo reordering / removal.
- Video export via `MediaRecorder`.
- Settings: frame shape, eye-line height, eye spacing, background, speed, loops.
- Docs: README, About page, this plan, privacy note.

### Phase 2 — Refinements (next)
- Draggable eye markers (nudge a point after placing it).
- Keyboard shortcuts (arrows to switch photos, `[`/`]` to scrub).
- Cross-fade / morph transition between frames.
- Persist marks for the session via `sessionStorage` (still local-only).
- Simple onion-skin overlay to compare consecutive frames.

### Phase 3 — Stretch goals
- Optional **self-hosted** face detection (MediaPipe Tasks-Vision or
  face-api.js, committed into the repo) to auto-place eyes, with manual
  correction. Kept behind an explicit opt-in to honour the "limit third-party
  code" preference.
- Animated GIF export (would require a small encoder such as `gif.js`).
- Shareable links (would need Cloudflare Workers + KV/R2 — server-side, out of
  scope for the privacy-first MVP).

## Testing checklist

- [ ] Upload mixed image types and sizes; verify thumbnails and status badges.
- [ ] Mark eyes; confirm the loupe tracks the cursor and marks land accurately.
- [ ] Verify alignment across portrait/landscape/tilted source photos.
- [ ] Preview at low and high fps; scrub; reorder; remove photos.
- [ ] Export on Safari (MP4) and Chrome/Edge (WebM); confirm the download plays.
- [ ] Confirm graceful message when `MediaRecorder` is unavailable.
