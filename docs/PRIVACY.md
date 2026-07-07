# Privacy

Face Animation is designed so your photos stay yours.

## What happens to my photos?

**Nothing leaves your device.** All processing — reading the images, marking the
eyes, aligning, animating, and encoding the video — happens inside your browser
using built-in APIs. There is:

- **No upload.** Photos are read locally with the File API and kept only in
  memory (and as temporary in-browser object URLs).
- **No server.** The site is static files served by Cloudflare Pages; it has no
  backend that could receive your images.
- **No account or login.**
- **No analytics, trackers, cookies, or third-party scripts.**

When you close or reload the tab, the images are discarded from memory.

## What Cloudflare can see

Cloudflare Pages serves the static site (HTML, CSS, JS, favicon). As with any
website, Cloudflare's edge will log standard request metadata (your IP address,
the files requested, timestamps) for the static assets. It **cannot** see your
photos, because those are never sent over the network.

## The exported video

When you export, the video file is created in your browser and offered as a
normal download. It is saved wherever your browser saves downloads. Sharing it
afterwards is entirely up to you.

## Verifying this yourself

The site has no build step and no minification, so the code is readable as-is.
You can open your browser's developer tools → **Network** tab and confirm that
adding photos and exporting produce **no outbound requests** carrying image
data.
