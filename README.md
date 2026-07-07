# Face Animation

Turn a set of face photos into a smooth animation where every face is **scaled
and rotated so the eyes stay level and in the same position** from frame to
frame — the effect behind "aging timelapse" and "a photo a day" videos.

Everything runs **client-side** in the browser. Photos are never uploaded:
there is no server, no account, and no analytics. It's built with plain HTML,
CSS, and JavaScript — **no framework and no third-party runtime dependencies.**

> Live preview works everywhere; video export uses the browser's built-in
> `MediaRecorder` (MP4 on Safari, WebM on Chrome/Edge).

## How it works

1. **Add photos** — choose or drag in a set of face photos.
2. **Mark the eyes** — click the left eye, then the right eye, on each photo.
   A magnifier loupe helps you click precisely.
3. **Align** — from the two eye points the app computes a rotation, uniform
   scale, and translation so the eyes are horizontal, the same distance apart,
   and centred on the same spot. Frames are drawn with the Canvas 2D API.
4. **Preview** — the aligned frames are cycled with `requestAnimationFrame`.
   Adjust speed, scrub frames, reorder or remove photos.
5. **Export** — record the animation to a video with `MediaRecorder`.

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the design
and roadmap, and [`docs/PRIVACY.md`](docs/PRIVACY.md) for the privacy model.

## Project structure

```
.
├── index.html            # The app (upload → mark → align → animate → export)
├── about/index.html      # About / how-it-works page
├── assets/
│   ├── css/
│   │   ├── styles.css     # Base styles, colours, header/footer
│   │   └── app.css        # App layout & components
│   ├── js/
│   │   ├── main.js        # App orchestration & UI wiring (ES module)
│   │   ├── align.js       # Pure Canvas 2D alignment math
│   │   └── recorder.js    # MediaRecorder video export
│   └── favicon.svg
└── docs/                  # Implementation plan & privacy notes
```

## Running locally

Because the app uses ES modules, open it through a local web server rather than
`file://`. Any static server works — for example:

```sh
# Python 3
python3 -m http.server 8000

# or Node (no install: uses npx)
npx serve .
```

Then visit <http://localhost:8000>.

## Deploying to Cloudflare Pages

This is a static site with **no build step**.

1. Push the repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
   Git**, and select this repository.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (the repo root)
4. Deploy. Cloudflare auto-deploys on every push to the production branch, and
   creates preview deployments for pull requests.

The free Pages tier comfortably covers this site (static assets, unlimited
requests/bandwidth, 500 builds/month). No Workers, KV, or R2 are required
because all processing happens in the browser.

## Browser support

| Browser | Preview | Video export |
| --- | --- | --- |
| Safari (macOS 14.1+, iOS 14.5+) | ✅ | ✅ MP4/H.264 |
| Chrome / Edge (recent) | ✅ | ✅ WebM |
| Older browsers | ✅ | ⚠️ needs `MediaRecorder` |

## License

MIT — see [`LICENSE`](LICENSE).
