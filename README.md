# wallpaapi ✿

Turn a folder (or several) of photos into a cozy collage wallpaper.

![templates](https://img.shields.io/badge/templates-burst%20%C2%B7%20mosaic%20%C2%B7%20shape-c4a7e7)

## Run

```sh
docker compose up --build
```

Open <http://localhost:3000>, pick a folder with 📂, tick your photos, and
generate.

## Features

- **Folder picker** — 📂 opens your OS folder dialog and uploads the photos.
  If the folder has subfolders you choose between *just this folder* and
  *include subfolders (recursive)*.
- **Multiple folders** — add as many as you like; tick/untick individual
  photos in the gallery.
- **Templates**
  - ☀ **Burst** — dense scattered polaroids, large in the centre, confetti at
    the edges (album-cover style).
  - ▦ **Mosaic** — edge-to-edge irregular grid.
  - ♥ **Shape** — photos fill a heart, star, circle, or a **custom shape you
    draw** on a canvas.
- **Background** — solid / linear gradient / radial glow, two color pickers.
- **Centre text** — title + subtitle with sliders for size, letter spacing,
  and the translucent text-box opacity.
- **Collage opacity slider**, density slider, polaroid frames toggle, and a
  shuffle seed (🎲) to re-roll the layout.
- **Few photos?** If you select fewer than 16, the app offers to duplicate
  them to fill the collage.
- Output sizes: 1920×1080, 2560×1440, 1080×1920 (phone), 2048×2048.

## Dev (without Docker)

```sh
# backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (proxies /api to :8000)
cd frontend && npm install && npm run dev
```
