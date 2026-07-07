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
