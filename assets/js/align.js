// align.js — pure Canvas 2D alignment math. No third-party code.
//
// Given two eye points per photo (left eye, right eye, in the photo's own
// pixel coordinates) we compute a similarity transform (rotate + uniform
// scale + translate) that places both eyes on a fixed horizontal line at a
// fixed position and a fixed inter-eye distance in the output frame.
//
// The transform maps an image point p to:
//     out = Rot(-angle) * scale * (p - midpoint) + target
// which is exactly what the chained canvas calls below produce.

/**
 * Default alignment layout. All fractions are relative to the output frame.
 * @typedef {Object} Layout
 * @property {number} width      Output frame width in px.
 * @property {number} height     Output frame height in px.
 * @property {number} eyeY       Vertical position of the eye line (0..1).
 * @property {number} eyeGap     Inter-eye distance as a fraction of width.
 * @property {string} background CSS colour, or "transparent".
 */

/** @type {Layout} */
export const DEFAULT_LAYOUT = {
  width: 720,
  height: 720,
  eyeY: 0.42,
  eyeGap: 0.34,
  background: "#000000",
};

/**
 * Compute the geometric pieces of the alignment transform for one photo.
 *
 * @param {{x:number,y:number}} leftEye  Left eye in image pixel coords.
 * @param {{x:number,y:number}} rightEye Right eye in image pixel coords.
 * @param {Layout} layout
 * @returns {{angle:number, scale:number, midpoint:{x:number,y:number},
 *            target:{x:number,y:number}}}
 */
export function computeTransform(leftEye, rightEye, layout) {
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const angle = Math.atan2(dy, dx);
  const dist = Math.hypot(dx, dy) || 1; // guard against divide-by-zero

  const targetDist = layout.eyeGap * layout.width;
  const scale = targetDist / dist;

  const midpoint = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };
  const target = {
    x: layout.width / 2,
    y: layout.height * layout.eyeY,
  };

  return { angle, scale, midpoint, target };
}

/**
 * Draw an image onto a 2D context, aligned so the eyes land on the fixed line.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context sized to the layout.
 * @param {CanvasImageSource} image
 * @param {{x:number,y:number}} leftEye
 * @param {{x:number,y:number}} rightEye
 * @param {Layout} layout
 * @param {number} [dealAngle=0]  Extra rotation in radians applied about the
 *   eye midpoint. Zero keeps the eyes perfectly level (the default alignment);
 *   a non-zero value tilts the whole photo like a physical print dealt onto a
 *   pile, so more background shows around its edges.
 */
export function drawAligned(ctx, image, leftEye, rightEye, layout, dealAngle = 0) {
  const { angle, scale, midpoint, target } = computeTransform(
    leftEye,
    rightEye,
    layout
  );

  ctx.save();
  ctx.clearRect(0, 0, layout.width, layout.height);
  if (layout.background && layout.background !== "transparent") {
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }

  // Order matters: canvas applies these as post-multiplications, so the
  // last translate is the first thing that happens to a point. The deal
  // angle rotates the already-levelled photo about the target eye midpoint:
  // Rot(dealAngle) * Rot(-angle) = Rot(dealAngle - angle).
  ctx.translate(target.x, target.y);
  ctx.rotate(dealAngle - angle);
  ctx.scale(scale, scale);
  ctx.translate(-midpoint.x, -midpoint.y);

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/**
 * Render an aligned frame to a fresh offscreen canvas and return it.
 *
 * @param {CanvasImageSource} image
 * @param {{x:number,y:number}} leftEye
 * @param {{x:number,y:number}} rightEye
 * @param {Layout} layout
 * @param {number} [dealAngle=0]  See {@link drawAligned}.
 * @returns {HTMLCanvasElement}
 */
export function renderFrame(image, leftEye, rightEye, layout, dealAngle = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  drawAligned(ctx, image, leftEye, rightEye, layout, dealAngle);
  return canvas;
}

// ---------------------------------------------------------------------------
// Pile of photos
// ---------------------------------------------------------------------------
//
// A "pile" stacks every photo into a single frame. Each photo is aligned so
// the eyes land on the same fixed spot, then clipped to a rectangular "print"
// and tilted by its own deal angle *about the eye midpoint*. Because the print
// is a bounded rectangle — not the whole source image — the ones underneath
// peek out around the edges and the background shows through the fanned gaps,
// just like a physical pile of prints dealt onto a table.
//
// Cutting a rectangle that is axis-aligned in the (levelled) output frame and
// then rotating it is exactly the "cut a rectangle not aligned with the
// original photo" trick from the feature request: the clip rectangle is
// straight relative to the eyes, so relative to the source pixels it is
// rotated.

/**
 * Styling + geometry for the individual prints in a pile.
 * @typedef {Object} PrintOptions
 * @property {number} printFrac  Print size as a fraction of the frame (0..1).
 * @property {boolean} border    Draw a white photo-print border around each.
 * @property {string} borderColor CSS colour for the print border.
 * @property {boolean} shadow     Cast a soft drop shadow behind each print.
 * @property {boolean} levelEyes  Keep the face inside each print level. When
 *   true the print's rectangular frame is tilted by the deal angle but the
 *   face drawn inside stays horizontal, so every set of eyes lines up in a
 *   straight row across a fanned-out pile. When false the whole print — border
 *   and face together — tilts as one rigid unit (the classic dealt-photo look).
 */

/** @type {PrintOptions} */
export const DEFAULT_PRINT = {
  printFrac: 0.72,
  border: true,
  borderColor: "#ffffff",
  shadow: true,
  levelEyes: true,
};

/**
 * Compute the print rectangle in the levelled output frame (before the deal
 * rotation), expressed relative to the eye midpoint at the origin.
 *
 * @param {Layout} layout
 * @param {number} printFrac
 * @returns {{x:number, y:number, w:number, h:number}}
 */
function printRect(layout, printFrac) {
  const w = layout.width * printFrac;
  const h = layout.height * printFrac;
  // Place the eyes at the same relative height inside the print as they sit in
  // the full frame, so the face is framed naturally. The eyes are at the
  // origin; the print centre therefore sits (0.5 - eyeY) * h below them.
  const centreDy = (0.5 - layout.eyeY) * h;
  return { x: -w / 2, y: centreDy - h / 2, w, h };
}

/**
 * Draw a single eye-aligned "print" onto an existing context, without clearing
 * or painting the background — so prints can be stacked into a pile.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{image:CanvasImageSource, leftEye:{x:number,y:number},
 *          rightEye:{x:number,y:number}, dealAngle?:number}} print
 * @param {Layout} layout
 * @param {Partial<PrintOptions>} [opts]
 */
export function drawPrint(ctx, print, layout, opts = {}) {
  const o = { ...DEFAULT_PRINT, ...opts };
  const { image, leftEye, rightEye, dealAngle = 0 } = print;
  const { angle, scale, midpoint, target } = computeTransform(
    leftEye,
    rightEye,
    layout
  );
  const rect = printRect(layout, o.printFrac);
  const border = Math.max(2, layout.width * 0.006);

  ctx.save();
  // Pivot on the eye midpoint so the eyes stay fixed no matter the tilt.
  ctx.translate(target.x, target.y);
  ctx.rotate(dealAngle);

  // A white backing slightly larger than the photo gives each print a border,
  // and (optionally) casts a soft shadow so the stack reads with depth.
  if (o.border) {
    ctx.save();
    if (o.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = layout.width * 0.02;
      ctx.shadowOffsetX = layout.width * 0.004;
      ctx.shadowOffsetY = layout.width * 0.006;
    }
    ctx.fillStyle = o.borderColor;
    ctx.fillRect(
      rect.x - border,
      rect.y - border,
      rect.w + border * 2,
      rect.h + border * 2
    );
    ctx.restore();
  }

  // Clip to the print rectangle, then draw the eye-aligned photo inside it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  // The clip region is now locked into device space, so the content transform
  // no longer has to share the print's tilt. In "level eyes" mode we drop the
  // deal angle from the content transform entirely: reset to identity and
  // rebuild translate(target) → rotate(-angle) → scale → translate(-midpoint),
  // exactly the non-pile eye-levelling transform. The print's rectangle stays
  // tilted (drawn above) but the face inside comes out horizontal. When the
  // flag is off we keep building on the tilted transform, so border and face
  // rotate together as one rigid print.
  if (o.levelEyes) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(target.x, target.y);
  }
  ctx.rotate(-angle);
  ctx.scale(scale, scale);
  ctx.translate(-midpoint.x, -midpoint.y);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0);
  ctx.restore();

  ctx.restore();
}

/**
 * Render one frame of a pile: the background plus every print stacked, with the
 * highlighted photo drawn last so it sits on top of the pile.
 *
 * @param {Array<{image:CanvasImageSource, leftEye:{x:number,y:number},
 *          rightEye:{x:number,y:number}, dealAngle?:number}>} prints
 * @param {number} topIndex  Index drawn last (on top); -1 for natural order.
 * @param {Layout} layout
 * @param {Partial<PrintOptions>} [opts]
 * @returns {HTMLCanvasElement}
 */
export function renderPileFrame(prints, topIndex, layout, opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, layout.width, layout.height);
  if (layout.background && layout.background !== "transparent") {
    ctx.fillStyle = layout.background;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }

  const order = prints.map((_, i) => i).filter((i) => i !== topIndex);
  if (topIndex >= 0 && topIndex < prints.length) order.push(topIndex);
  order.forEach((i) => drawPrint(ctx, prints[i], layout, opts));

  return canvas;
}
