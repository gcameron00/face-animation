// recorder.js — export the aligned animation to a video file using only the
// browser-native MediaRecorder API. No third-party encoder.

/**
 * Pick the best supported video MIME type for this browser.
 * Safari records MP4/H.264; Chromium usually defaults to WebM.
 * @returns {{mimeType:string, extension:string}|null}
 */
export function pickMimeType() {
  const candidates = [
    { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

/** Whether recording is possible at all in this browser. */
export function canRecord() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMimeType() !== null
  );
}

/**
 * Record an animation by driving `drawFrame` through every frame for a number
 * of loops at a given frame rate, capturing the canvas stream in real time.
 *
 * @param {HTMLCanvasElement} canvas   The canvas being animated & recorded.
 * @param {(index:number)=>void} drawFrame  Draws frame `index` onto canvas.
 * @param {Object} opts
 * @param {number} opts.frameCount  Number of distinct frames.
 * @param {number} opts.fps         Frames per second.
 * @param {number} opts.loops       How many times to play through the frames.
 * @param {(p:number)=>void} [opts.onProgress]  0..1 progress callback.
 * @returns {Promise<{blob:Blob, extension:string}>}
 */
export function recordAnimation(canvas, drawFrame, opts) {
  const { frameCount, fps, loops, onProgress } = opts;
  const type = pickMimeType();
  if (!type) return Promise.reject(new Error("Recording is not supported in this browser."));

  return new Promise((resolve, reject) => {
    const stream = canvas.captureStream(fps);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: type.mimeType });
    } catch (err) {
      reject(err);
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => reject(e.error || new Error("Recording failed."));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.mimeType });
      resolve({ blob, extension: type.extension });
    };

    const totalFrames = frameCount * loops;
    let i = 0;
    const interval = 1000 / fps;

    recorder.start();

    // Draw the first frame immediately, then step on a timer so the recorded
    // duration matches frameCount * loops / fps.
    const step = () => {
      if (i >= totalFrames) {
        // Give the recorder a beat to flush the final frame before stopping.
        setTimeout(() => recorder.state !== "inactive" && recorder.stop(), interval);
        return;
      }
      drawFrame(i % frameCount);
      if (onProgress) onProgress((i + 1) / totalFrames);
      i += 1;
      setTimeout(step, interval);
    };
    step();
  });
}
